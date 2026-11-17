import { Injectable } from '@angular/core';

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

import { Observable } from 'rxjs';
import { httpsCallable } from 'firebase/functions';

import { FirebaseService } from '../firebase/firebase.service';
import { NuevoVotante, Votante, SimpatizanteJerarquia } from '../models/votante.model';

interface NuevoVotanteExtendido extends NuevoVotante {
  registradoSinConexion?: boolean;
  fechaCapturaLocal?: string;
  origenCaptura?: string;
  movilizadorUid?: string;
  movilizadorNombre?: string;
  seccionalUid?: string;
  seccionalNombre?: string;
  asignadoPorUid?: string;
  asignadoPorNombre?: string;
}

@Injectable({
  providedIn: 'root',
})
export class VotantesService {
  constructor(private firebaseService: FirebaseService) {}

  async registrarVotante(votante: NuevoVotanteExtendido): Promise<string> {
    const db = this.firebaseService.obtenerFirestore();

    const claveElectorNormalizada = this.normalizarClaveElector(votante.claveElector);

    if (!claveElectorNormalizada) {
      throw new Error('CLAVE_ELECTOR_INVALIDA');
    }

    const votanteRef = doc(db, 'votantes', claveElectorNormalizada);

    const rolUsuario = localStorage.getItem('rolUsuario') || '';
    const hayConexion = navigator.onLine;

    /*
      Solo revisamos duplicados con getDoc cuando hay internet y el usuario
      es coordinador, porque los usuarios seccional/movilizador pueden no tener
      permiso de lectura completa en Firestore.
    */
    if (hayConexion && rolUsuario === 'coordinador') {
      const existente = await getDoc(votanteRef);

      if (existente.exists()) {
        throw new Error('REGISTRO_REPETIDO');
      }
    }

    const fechaLocal = new Date().toISOString();

    const datosParaGuardar = {
      ...votante,

      nombreCompleto: this.normalizarTexto(votante.nombreCompleto),
      telefono: this.normalizarTelefono(votante.telefono),
      direccion: this.normalizarTexto(votante.direccion),
      edad: Number(votante.edad),
      claveElector: claveElectorNormalizada,
      seccion: Number(votante.seccion),
      municipio: String(votante.municipio || '').trim(),
      colonia: String(votante.colonia || '').trim(),
      tieneFacebook: Boolean(votante.tieneFacebook),
      usuarioFacebook: votante.tieneFacebook ? String(votante.usuarioFacebook || '').trim() : '',

      activo: true,

      fechaRegistro: serverTimestamp(),
      fechaRegistroLocal: fechaLocal,
      fechaCapturaLocal: votante.fechaCapturaLocal || fechaLocal,

      registradoSinConexion:
        votante.registradoSinConexion !== undefined ? votante.registradoSinConexion : !hayConexion,

      origenCaptura: votante.origenCaptura || 'formulario',

      capturadoPorUid: votante.capturadoPorUid || '',
      capturadoPorNombre: votante.capturadoPorNombre || '',
      capturadoPorRol: votante.capturadoPorRol || '',

      movilizadorUid: votante.movilizadorUid || '',
      movilizadorNombre: votante.movilizadorNombre || '',
      seccionalUid: votante.seccionalUid || '',
      seccionalNombre: votante.seccionalNombre || '',
      asignadoPorUid: votante.asignadoPorUid || '',
      asignadoPorNombre: votante.asignadoPorNombre || '',
    };

    const escritura = setDoc(votanteRef, datosParaGuardar);

    if (!hayConexion) {
      escritura.catch((error: any) => {
        console.error('Error posterior al sincronizar simpatizante:', error);
      });

      return claveElectorNormalizada;
    }

    try {
      await escritura;
      return claveElectorNormalizada;
    } catch (error: any) {
      if (error?.code === 'permission-denied') {
        throw new Error('REGISTRO_REPETIDO');
      }

      throw error;
    }
  }

  async obtenerSimpatizantesDeMovilizador(uid: string): Promise<SimpatizanteJerarquia[]> {
    const respuesta = await httpsCallable<{ accion: string; movilizadorUid: string }, { simpatizantes: SimpatizanteJerarquia[] }>(this.firebaseService.obtenerFunctions(), 'gestionarJerarquia')({ accion: 'listarSimpatizantes', movilizadorUid: uid });
    return respuesta.data.simpatizantes;
  }

  obtenerVotantes(): Observable<Votante[]> {
    const db = this.firebaseService.obtenerFirestore();

    const votantesRef = collection(db, 'votantes');
    const consulta = query(votantesRef, orderBy('fechaRegistro', 'desc'));

    return new Observable<Votante[]>((observer) => {
      const cancelarSuscripcion = onSnapshot(
        consulta,
        {
          includeMetadataChanges: true,
        },
        (snapshot) => {
          const votantes = snapshot.docs.map((documento) => {
            const datos = documento.data();

            return {
              id: documento.id,

              nombreCompleto: datos['nombreCompleto'] || '',
              telefono: datos['telefono'] || '',
              direccion: datos['direccion'] || '',
              edad: datos['edad'] || 0,
              claveElector: datos['claveElector'] || '',
              seccion: datos['seccion'] || 0,
              municipio: datos['municipio'] || '',
              colonia: datos['colonia'] || '',
              tieneFacebook: datos['tieneFacebook'] || false,
              usuarioFacebook: datos['usuarioFacebook'] || '',
              activo: datos['activo'] ?? true,

              capturadoPorUid: datos['capturadoPorUid'] || '',
              capturadoPorNombre: datos['capturadoPorNombre'] || '',
              capturadoPorRol: datos['capturadoPorRol'] || '',

              movilizadorUid: datos['movilizadorUid'] || '',
              movilizadorNombre: datos['movilizadorNombre'] || '',
              seccionalUid: datos['delegadoUid'] || '',
              seccionalNombre: datos['delegadoNombre'] || '',
              asignadoPorUid: datos['asignadoPorUid'] || '',
              asignadoPorNombre: datos['asignadoPorNombre'] || '',

              registradoSinConexion: datos['registradoSinConexion'] || false,
              fechaRegistroLocal: datos['fechaRegistroLocal'] || '',

              pendienteSincronizacion: documento.metadata.hasPendingWrites,
              desdeCache: snapshot.metadata.fromCache,

              fechaRegistro: datos['fechaRegistro']?.toDate
                ? datos['fechaRegistro'].toDate()
                : null,

              fechaActualizacion: datos['fechaActualizacion']?.toDate
                ? datos['fechaActualizacion'].toDate()
                : null,
            } as Votante;
          });

          observer.next(votantes);
        },
        (error) => {
          console.error('Error al obtener simpatizantes:', error);
          observer.error(error);
        },
      );

      return () => cancelarSuscripcion();
    });
  }

  async actualizarVotante(id: string, datos: Partial<NuevoVotanteExtendido>): Promise<void> {
    const db = this.firebaseService.obtenerFirestore();
    const votanteRef = doc(db, 'votantes', id);

    await updateDoc(votanteRef, {
      ...datos,
      fechaActualizacion: serverTimestamp(),
    });
  }

  async cambiarEstadoVotante(id: string, activo: boolean): Promise<void> {
    const db = this.firebaseService.obtenerFirestore();
    const votanteRef = doc(db, 'votantes', id);

    await updateDoc(votanteRef, {
      activo,
      fechaActualizacion: serverTimestamp(),
    });
  }

  async eliminarVotante(id: string): Promise<void> {
    const db = this.firebaseService.obtenerFirestore();
    const votanteRef = doc(db, 'votantes', id);

    await deleteDoc(votanteRef);
  }

  private normalizarTexto(valor: string): string {
    return String(valor || '')
      .trim()
      .replace(/\s+/g, ' ')
      .toUpperCase();
  }

  private normalizarTelefono(telefono: string): string {
    return String(telefono || '').replace(/\D/g, '');
  }

  private normalizarClaveElector(claveElector: string): string {
    return String(claveElector || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '');
  }
}
