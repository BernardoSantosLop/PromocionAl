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

import { FirebaseService } from '../firebase/firebase.service';
import { Colonia } from '../models/colonia.model';

@Injectable({
  providedIn: 'root',
})
export class ColoniasService {
  constructor(private firebaseService: FirebaseService) {}

  obtenerColonias(): Observable<Colonia[]> {
    const db = this.firebaseService.obtenerFirestore();

    const coloniasRef = collection(db, 'colonias');
    const consulta = query(coloniasRef, orderBy('nombre', 'asc'));

    return new Observable<Colonia[]>((observer) => {
      const cancelarSuscripcion = onSnapshot(
        consulta,
        (snapshot) => {
          const colonias = snapshot.docs.map((documento) => {
            const datos = documento.data();

            return {
              id: documento.id,
              nombre: datos['nombre'] || '',
              tipo: datos['tipo'] === 'LOCALIDAD' ? 'LOCALIDAD' : 'COLONIA',
              secciones: Array.isArray(datos['secciones']) ? datos['secciones'].map(Number) : [],
              municipio: datos['municipio'] || '',
              activo: datos['activo'] ?? true,
              fechaRegistro: datos['fechaRegistro']?.toDate
                ? datos['fechaRegistro'].toDate()
                : null,
              fechaActualizacion: datos['fechaActualizacion']?.toDate
                ? datos['fechaActualizacion'].toDate()
                : null,
            } as Colonia;
          });

          observer.next(colonias);
        },
        (error) => {
          console.error('Error al obtener colonias:', error);
          observer.error(error);
        }
      );

      return () => cancelarSuscripcion();
    });
  }

  async crearColonia(colonia: Omit<Colonia, 'id'>): Promise<void> {
    const db = this.firebaseService.obtenerFirestore();

    let id = this.generarIdColonia(colonia.municipio, colonia.nombre);
    const existente = await getDoc(doc(db, 'colonias', id));
    if (existente.exists() && (existente.data()['tipo'] || 'COLONIA') !== (colonia.tipo || 'COLONIA')) {
      id += `-${(colonia.tipo || 'COLONIA').toLowerCase()}`;
    }
    const coloniaRef = doc(db, 'colonias', id);

    await setDoc(
      coloniaRef,
      {
        nombre: colonia.nombre || '',
        tipo: colonia.tipo || 'COLONIA',
        secciones: colonia.secciones || [],
        municipio: colonia.municipio || '',
        activo: colonia.activo ?? true,
        fechaRegistro: serverTimestamp(),
        fechaActualizacion: serverTimestamp(),
      },
      {
        merge: true,
      }
    );
  }

  async guardarColoniaImportada(colonia: Omit<Colonia, 'id'>): Promise<void> {
    await this.crearColonia(colonia);
  }

  async actualizarColonia(
    id: string,
    colonia: Partial<Omit<Colonia, 'id'>>
  ): Promise<void> {
    const db = this.firebaseService.obtenerFirestore();
    const coloniaRef = doc(db, 'colonias', id);

    await updateDoc(coloniaRef, {
      ...colonia,
      fechaActualizacion: serverTimestamp(),
    });
  }

  async cambiarEstadoColonia(id: string, activo: boolean): Promise<void> {
    const db = this.firebaseService.obtenerFirestore();
    const coloniaRef = doc(db, 'colonias', id);

    await updateDoc(coloniaRef, {
      activo,
      fechaActualizacion: serverTimestamp(),
    });
  }

  async eliminarColonia(id: string): Promise<void> {
    const db = this.firebaseService.obtenerFirestore();
    const coloniaRef = doc(db, 'colonias', id);

    await deleteDoc(coloniaRef);
  }

  private generarIdColonia(municipio: string, nombre: string): string {
    return `${municipio}-${nombre}`
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}
