import { Injectable, inject } from '@angular/core';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { Observable } from 'rxjs';
import { FirebaseService } from '../firebase/firebase.service';
import {
  SeccionAsignada,
  FilaCasilla,
  CasillaAsignada,
  nombreCasilla,
  validarSeccionAsignada,
} from '../models/seccion-asignada.model';

@Injectable({ providedIn: 'root' })
export class ControlElectoralService {
  private firebase = inject(FirebaseService);
  private readonly coleccion = 'controlElectoralSecciones';

  obtenerSeccionesAsignadas(): Observable<SeccionAsignada[]> {
    const referencia = collection(this.firebase.obtenerFirestore(), this.coleccion);
    return new Observable((observer) =>
      onSnapshot(
        referencia,
        (snapshot) => {
          const secciones = snapshot.docs
            .map((documento) => {
              const datos = documento.data();
              return {
                id: documento.id,
                seccion: Number(datos['seccion']),
                numeroRuta: Number(datos['numeroRuta']),
                casillas: datos['casillas'] || [],
              } as SeccionAsignada;
            })
            .sort((a, b) => a.seccion - b.seccion);
          observer.next(secciones);
        },
        (error) => observer.error(error),
      ),
    );
  }

  async guardarSeccion(
    seccion: number,
    numeroRuta: number,
    filas: FilaCasilla[],
    idEdicion = '',
  ): Promise<void> {
    const casillas = validarSeccionAsignada(seccion, numeroRuta, filas);
    const usuario = this.firebase.obtenerAuth().currentUser;
    if (!usuario) throw new Error('Inicia sesión para registrar las secciones.');
    const id = `${numeroRuta}_${seccion}`;
    const db = this.firebase.obtenerFirestore();
    const referencia = doc(db, this.coleccion, id);
    const referenciaAnterior = doc(db, this.coleccion, idEdicion || id);
    // Older records were keyed only by section. Keep them usable without a bulk migration.
    const referenciaLegacy = doc(db, this.coleccion, String(seccion));
    await runTransaction(db, async (transaccion) => {
      const [destino, anterior, legacy] = await Promise.all([
        transaccion.get(referencia),
        transaccion.get(referenciaAnterior),
        transaccion.get(referenciaLegacy),
      ]);
      if (idEdicion && !anterior.exists())
        throw new Error('Esta sección ya no existe. Vuelve a registrarla.');
      if (idEdicion && Number(anterior.data()!['seccion']) !== seccion)
        throw new Error('El número de sección no se puede cambiar durante la edición.');
      if (
        idEdicion && ((destino.exists() && idEdicion !== id) ||
        (legacy.exists() && idEdicion !== String(seccion) && Number(legacy.data()!['numeroRuta']) === numeroRuta))
      )
        throw new Error(
          'Esta sección ya está registrada en esta ruta. Usa Editar para agregar o modificar sus casillas.',
        );
      const datos = {
        seccion,
        numeroRuta,
        casillas,
        actualizadoPorUid: usuario.uid,
        fechaActualizacion: serverTimestamp(),
      };
      const existente = destino.exists() ? destino :
        legacy.exists() && Number(legacy.data()!['numeroRuta']) === numeroRuta ? legacy : null;
      if (!idEdicion && existente) {
        const anteriores: CasillaAsignada[] = existente.data()!['casillas'] || [];
        const nombres = new Set(anteriores.map(nombreCasilla));
        const repetida = casillas.find((casilla) => nombres.has(nombreCasilla(casilla)));
        if (repetida)
          throw new Error(`La casilla ${nombreCasilla(repetida)} ya está registrada en la sección ${seccion} de esta ruta. Usa Editar para modificarla.`);
        transaccion.update(destino.exists() ? referencia : referenciaLegacy, {
          ...datos,
          casillas: [...anteriores, ...casillas],
        });
        return;
      }
      if (idEdicion === id) transaccion.update(referencia, datos);
      else if (idEdicion) {
        transaccion.set(referencia, { ...anterior.data(), ...datos });
        transaccion.delete(referenciaAnterior);
      } else
        transaccion.set(referencia, {
          ...datos,
          creadoPorUid: usuario.uid,
          fechaRegistro: serverTimestamp(),
        });
    });
  }

  async eliminarSeccion(id: string): Promise<void> {
    await deleteDoc(doc(this.firebase.obtenerFirestore(), this.coleccion, id));
  }
}
