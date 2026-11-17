import { Injectable } from '@angular/core';

import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

import { Observable } from 'rxjs';

import { FirebaseService } from '../firebase/firebase.service';
import { SeccionElectoral } from '../models/seccion-electoral.model';

@Injectable({
  providedIn: 'root',
})
export class SeccionesElectoralesService {
  constructor(private firebaseService: FirebaseService) {}

  obtenerSecciones(): Observable<SeccionElectoral[]> {
    const db = this.firebaseService.obtenerFirestore();

    const seccionesRef = collection(db, 'seccionesElectorales');
    const consulta = query(seccionesRef, orderBy('seccion', 'asc'));

    return new Observable<SeccionElectoral[]>((observer) => {
      const cancelarSuscripcion = onSnapshot(
        consulta,
        (snapshot) => {
          const secciones = snapshot.docs.map((documento) => {
            const datos = documento.data();

            return {
              id: documento.id,
              seccion: datos['seccion'] || 0,
              municipio: datos['municipio'] || '',
              colonia: datos['colonia'] || '',
              activo: datos['activo'] ?? true,
              fechaActualizacion: datos['fechaActualizacion']?.toDate
                ? datos['fechaActualizacion'].toDate()
                : null,
            } as SeccionElectoral;
          });

          observer.next(secciones);
        },
        (error) => {
          console.error('Error al obtener secciones:', error);
          observer.error(error);
        }
      );

      return () => cancelarSuscripcion();
    });
  }

  async guardarSeccion(seccion: SeccionElectoral): Promise<void> {
    const db = this.firebaseService.obtenerFirestore();

    const id = String(seccion.seccion);
    const seccionRef = doc(db, 'seccionesElectorales', id);

    await setDoc(
      seccionRef,
      {
        seccion: Number(seccion.seccion),
        municipio: seccion.municipio || '',
        colonia: seccion.colonia || '',
        activo: seccion.activo ?? true,
        fechaActualizacion: serverTimestamp(),
      },
      {
        merge: true,
      }
    );
  }

  async cambiarEstadoSeccion(id: string, activo: boolean): Promise<void> {
    const db = this.firebaseService.obtenerFirestore();
    const seccionRef = doc(db, 'seccionesElectorales', id);

    await updateDoc(seccionRef, {
      activo,
      fechaActualizacion: serverTimestamp(),
    });
  }

  async eliminarSeccion(id: string): Promise<void> {
    const db = this.firebaseService.obtenerFirestore();
    const seccionRef = doc(db, 'seccionesElectorales', id);

    await deleteDoc(seccionRef);
  }
}