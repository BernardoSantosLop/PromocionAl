import { Injectable } from '@angular/core';
import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { Observable } from 'rxjs';

import { FirebaseService } from '../firebase/firebase.service';
import { UsuarioSistema, FichaRegistroEnlace } from '../models/usuario-sistema.model';

@Injectable({
  providedIn: 'root',
})
export class UsuariosService {
  constructor(private firebaseService: FirebaseService) {}

  obtenerUsuarios(): Observable<UsuarioSistema[]> {
    const db = this.firebaseService.obtenerFirestore();
    const usuariosRef = collection(db, 'usuarios');

    return new Observable<UsuarioSistema[]>((observer) => {
      const cancelarSuscripcion = onSnapshot(
        usuariosRef,
        (snapshot) => {
          const usuarios = snapshot.docs
            .map((documento) => {
              const datos = documento.data();

              return {
                uid: documento.id,
                nombre: datos['nombre'] || '',
                correo: datos['correo'] || '',
                rol: datos['rol'] || 'movilizador',
                activo: datos['activo'] ?? true,
                fichaRegistro: datos['fichaRegistro'],

                coordinadorUid: datos['coordinadorUid'] || '',
                coordinadorNombre: datos['coordinadorNombre'] || '',

                seccionalUid: datos['seccionalUid'] || datos['delegadoUid'] || '',
                seccionalNombre: datos['seccionalNombre'] || datos['delegadoNombre'] || '',
                delegadoUid: datos['delegadoUid'] || datos['seccionalUid'] || '',
                delegadoNombre: datos['delegadoNombre'] || datos['seccionalNombre'] || '',
                enlaceUid: datos['enlaceUid'] || '',
                enlaceNombre: datos['enlaceNombre'] || '',
              } as UsuarioSistema;
            })
            .sort((a, b) => a.nombre.localeCompare(b.nombre));

          observer.next(usuarios);
        },
        (error) => {
          console.error('Error al cargar usuarios:', error);
          observer.error(error);
        },
      );

      return () => cancelarSuscripcion();
    });
  }

  async guardarUsuario(usuario: UsuarioSistema): Promise<void> {
    const db = this.firebaseService.obtenerFirestore();
    const usuarioRef = doc(db, 'usuarios', usuario.uid);

    await setDoc(
      usuarioRef,
      {
        nombre: usuario.nombre.trim(),
        correo: usuario.correo.trim().toLowerCase(),
        rol: usuario.rol,
        activo: usuario.activo ?? true,
        ...(usuario.fichaRegistro ? { fichaRegistro: usuario.fichaRegistro } : {}),

        coordinadorUid: usuario.coordinadorUid || '',
        coordinadorNombre: usuario.coordinadorNombre || '',

        seccionalUid: usuario.seccionalUid || '',
        seccionalNombre: usuario.seccionalNombre || '',
        delegadoUid: usuario.delegadoUid || usuario.seccionalUid || '',
        delegadoNombre: usuario.delegadoNombre || usuario.seccionalNombre || '',
        enlaceUid: usuario.enlaceUid || '',
        enlaceNombre: usuario.enlaceNombre || '',

        fechaActualizacion: serverTimestamp(),
      },
      {
        merge: true,
      },
    );
  }

  async cambiarEstadoUsuario(uid: string, activo: boolean): Promise<void> {
    const db = this.firebaseService.obtenerFirestore();
    const usuarioRef = doc(db, 'usuarios', uid);

    await updateDoc(usuarioRef, {
      activo,
      fechaActualizacion: serverTimestamp(),
    });
  }

  async guardarFichaEnlace(uid: string, ficha: FichaRegistroEnlace): Promise<void> {
    const db = this.firebaseService.obtenerFirestore();
    await updateDoc(doc(db, 'usuarios', uid), {
      fichaRegistro: ficha,
      fechaActualizacion: serverTimestamp(),
    });
  }
}
