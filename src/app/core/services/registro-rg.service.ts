import { Injectable, inject } from '@angular/core';
import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { Observable } from 'rxjs';
import { FirebaseService } from '../firebase/firebase.service';
import { DatosRegistroPersona } from './registro-persona-destino';
import { RgCapturado, numeroRutaValido } from '../models/asignacion-rg.model';

@Injectable({ providedIn: 'root' })
export class RegistroRgService {
  private firebase = inject(FirebaseService);

  obtenerRgs(): Observable<RgCapturado[]> {
    const referencia = collection(this.firebase.obtenerFirestore(), 'controlElectoralRg');
    return new Observable((observer) =>
      onSnapshot(
        referencia,
        (snapshot) => {
          observer.next(
            snapshot.docs
              .map((documento) => {
                const datos = documento.data();
                return {
                  id: documento.id,
                  nombreCompleto: datos['nombreCompleto'] || 'Sin nombre',
                  telefono: datos['telefono'] || '',
                  seccion: Number(datos['seccion']) || 0,
                  colonia: datos['colonia'] || '',
                  claveElector: datos['claveElector'] || '',
                  direccion: datos['direccion'] || '',
                  municipio: datos['municipio'] || '',
                  edad: Number(datos['edad']) || null,
                  tieneFacebook: Boolean(datos['tieneFacebook']),
                  usuarioFacebook: datos['usuarioFacebook'] || '',
                  numeroRutaAsignada: numeroRutaValido(datos['numeroRutaAsignada']),
                };
              })
              .sort((a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto)),
          );
        },
        (error) => observer.error(error),
      ),
    );
  }

  async asignarRuta(
    idRg: string,
    numeroRuta: number | null,
    rutaAnterior: number | null,
  ): Promise<void> {
    const usuario = this.firebase.obtenerAuth().currentUser;
    if (!usuario) throw new Error('Inicia sesión para asignar rutas.');
    if (!idRg) throw new Error('Selecciona un RG válido.');
    if (numeroRuta !== null && numeroRutaValido(numeroRuta) !== numeroRuta)
      throw new Error('Selecciona una ruta válida.');
    const db = this.firebase.obtenerFirestore();
    const referencia = doc(db, 'controlElectoralRg', idRg);
    const seccionesRuta =
      numeroRuta === null
        ? null
        : await getDocs(
            query(
              collection(db, 'controlElectoralSecciones'),
              where('numeroRuta', '==', numeroRuta),
              limit(1),
            ),
          );
    if (seccionesRuta?.empty)
      throw new Error(
        'La ruta elegida ya no tiene secciones. Actualiza la lista y elige otra ruta.',
      );
    const seccionReferencia = seccionesRuta?.docs[0]?.ref;
    const asignados =
      numeroRuta === null
        ? null
        : await getDocs(
            query(
              collection(db, 'controlElectoralRg'),
              where('numeroRutaAsignada', '==', numeroRuta),
            ),
          );
    if (asignados?.docs.some((registro) => registro.id !== idRg))
      throw new Error(
        'Esta ruta ya tiene un RG asignado. Quita su asignación actual antes de asignarla a otro.',
      );
    const reservaNuevaRef =
      numeroRuta === null ? null : doc(db, 'controlElectoralRutasRg', String(numeroRuta));
    const reservaAnteriorRef =
      rutaAnterior === null || rutaAnterior === numeroRuta
        ? null
        : doc(db, 'controlElectoralRutasRg', String(rutaAnterior));
    await runTransaction(db, async (transaccion) => {
      const registro = await transaccion.get(referencia);
      if (!registro.exists()) throw new Error('El RG ya no existe. Actualiza la lista.');
      if (numeroRutaValido(registro.data()['numeroRutaAsignada']) !== rutaAnterior)
        throw new Error(
          'La ruta de este RG fue modificada por otra sesión. Actualiza antes de volver a asignarla.',
        );
      if (seccionReferencia) {
        const seccion = await transaccion.get(seccionReferencia);
        if (!seccion.exists() || numeroRutaValido(seccion.data()['numeroRuta']) !== numeroRuta)
          throw new Error(
            'La ruta cambió mientras se asignaba. Actualiza la lista y vuelve a intentarlo.',
          );
      }
      const reservaAnterior = reservaAnteriorRef ? await transaccion.get(reservaAnteriorRef) : null;
      const reservaNueva = reservaNuevaRef ? await transaccion.get(reservaNuevaRef) : null;
      const responsableActual = reservaNueva?.data()?.['rgId'];
      if (responsableActual && responsableActual !== idRg) {
        const responsable = await transaccion.get(doc(db, 'controlElectoralRg', responsableActual));
        if (
          responsable.exists() &&
          numeroRutaValido(responsable.data()['numeroRutaAsignada']) === numeroRuta
        )
          throw new Error('Esta ruta acaba de ser asignada a otro RG. Actualiza la lista.');
      }
      // La reserva compartida serializa asignaciones simultáneas a la misma ruta.
      if (reservaAnteriorRef && reservaAnterior?.data()?.['rgId'] === idRg)
        transaccion.delete(reservaAnteriorRef);
      if (reservaNuevaRef)
        transaccion.set(reservaNuevaRef, {
          numeroRuta,
          rgId: idRg,
          asignadoPorUid: usuario.uid,
          fechaActualizacion: serverTimestamp(),
        });
      transaccion.update(referencia, {
        numeroRutaAsignada: numeroRuta,
        rutaAsignadaPorUid: usuario.uid,
        fechaAsignacionRuta: serverTimestamp(),
        fechaActualizacion: serverTimestamp(),
      });
    });
  }

  async registrar(datos: DatosRegistroPersona): Promise<string> {
    const usuario = this.firebase.obtenerAuth().currentUser;
    if (!usuario) throw new Error('Inicia sesión para registrar un RG.');
    if (!navigator.onLine)
      throw new Error(
        'Para registrar un RG sin conexión, toma primero la foto de la INE y guárdala como pendiente. Los datos capturados se conservan en el formulario.',
      );
    const claveElector = String(datos.claveElector || '')
      .replace(/\s+/g, '')
      .toUpperCase();
    if (!claveElector) throw new Error('Captura la clave de elector del RG.');
    const texto = (valor: string) =>
      String(valor || '')
        .trim()
        .replace(/\s+/g, ' ')
        .toUpperCase();
    const db = this.firebase.obtenerFirestore();
    const referencia = doc(db, 'controlElectoralRg', claveElector);
    await runTransaction(db, async (transaccion) => {
      const existente = await transaccion.get(referencia);
      if (existente.exists()) throw new Error('REGISTRO_REPETIDO');
      transaccion.set(referencia, {
        nombreCompleto: texto(datos.nombreCompleto),
        telefono: String(datos.telefono || '').replace(/\D/g, ''),
        direccion: texto(datos.direccion),
        edad: Number(datos.edad),
        claveElector,
        seccion: Number(datos.seccion),
        municipio: datos.municipio.trim(),
        colonia: datos.colonia.trim(),
        tieneFacebook: Boolean(datos.tieneFacebook),
        usuarioFacebook: datos.tieneFacebook ? datos.usuarioFacebook.trim() : '',
        activo: true,
        capturadoPorUid: datos.capturadoPorUid || usuario.uid,
        capturadoPorNombre: datos.capturadoPorNombre || '',
        capturadoPorRol: datos.capturadoPorRol || 'coordinador',
        movilizadorUid: '',
        movilizadorNombre: '',
        seccionalUid: '',
        seccionalNombre: '',
        asignadoPorUid: datos.asignadoPorUid || usuario.uid,
        asignadoPorNombre: datos.asignadoPorNombre || '',
        registradoPorUid: usuario.uid,
        registradoSinConexion: datos.registradoSinConexion || false,
        fechaRegistroLocal: datos.fechaRegistroLocal || new Date().toISOString(),
        fechaCapturaLocal:
          datos.fechaCapturaLocal || datos.fechaRegistroLocal || new Date().toISOString(),
        origenCaptura: datos.origenCaptura || 'formulario',
        fechaRegistro: serverTimestamp(),
        fechaActualizacion: serverTimestamp(),
      });
    });
    return claveElector;
  }
}
