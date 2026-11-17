import { Injectable } from '@angular/core';

import { Auth, User, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';

import { doc, getDoc } from 'firebase/firestore';

import { FirebaseService } from '../firebase/firebase.service';
import { RolUsuario, UsuarioSistema } from '../models/usuario-sistema.model';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private auth: Auth;

  constructor(private firebaseService: FirebaseService) {
    this.auth = this.firebaseService.obtenerAuth();
  }

  async iniciarSesion(correo: string, password: string): Promise<UsuarioSistema> {
    const credencial = await signInWithEmailAndPassword(this.auth, correo, password);

    const perfil = await this.obtenerPerfilUsuario(credencial.user.uid);

    if (!perfil) {
      await this.cerrarSesion();
      throw new Error('El usuario no tiene perfil asignado en Firestore.');
    }

    if (!perfil.activo) {
      await this.cerrarSesion();
      throw new Error('El usuario está desactivado.');
    }

    localStorage.setItem('uid', perfil.uid);
    localStorage.setItem('nombreUsuario', perfil.nombre);
    localStorage.setItem('correoUsuario', perfil.correo);
    localStorage.setItem('rolUsuario', perfil.rol);

    return perfil;
  }

  async obtenerPerfilUsuario(uid: string): Promise<UsuarioSistema | null> {
    const db = this.firebaseService.obtenerFirestore();
    const usuarioRef = doc(db, 'usuarios', uid);
    const usuarioSnap = await getDoc(usuarioRef);

    if (!usuarioSnap.exists()) {
      return null;
    }

    const datos = usuarioSnap.data();

    return {
      uid,
      nombre: datos['nombre'] || '',
      correo: datos['correo'] || '',
      rol: (datos['rol'] || 'movilizador') as RolUsuario,
      activo: datos['activo'] ?? true,

      coordinadorUid: datos['coordinadorUid'] || '',
      coordinadorNombre: datos['coordinadorNombre'] || '',

      seccionalUid: datos['delegadoUid'] || '',
      seccionalNombre: datos['delegadoNombre'] || '',
      delegadoUid: datos['delegadoUid'] || datos['delegadoUid'] || '',
      delegadoNombre: datos['delegadoNombre'] || datos['delegadoNombre'] || '',
      enlaceUid: datos['enlaceUid'] || '',
      enlaceNombre: datos['enlaceNombre'] || '',
    };
  }

  obtenerUsuarioActual(): Promise<User | null> {
    return new Promise((resolve) => {
      const cancelar = onAuthStateChanged(this.auth, (usuario) => {
        cancelar();
        resolve(usuario);
      });
    });
  }

  async estaAutenticado(): Promise<boolean> {
    const usuario = await this.obtenerUsuarioActual();

    if (!usuario) {
      return false;
    }

    const perfil = await this.obtenerPerfilUsuario(usuario.uid);

    if (!perfil || !perfil.activo) {
      await this.cerrarSesion();
      return false;
    }

    localStorage.setItem('uid', perfil.uid);
    localStorage.setItem('nombreUsuario', perfil.nombre);
    localStorage.setItem('correoUsuario', perfil.correo);
    localStorage.setItem('rolUsuario', perfil.rol);

    return true;
  }

  async cerrarSesion(): Promise<void> {
    localStorage.removeItem('usuarioAutenticado');
    localStorage.removeItem('tipoUsuario');

    localStorage.removeItem('uid');
    localStorage.removeItem('nombreUsuario');
    localStorage.removeItem('correoUsuario');
    localStorage.removeItem('rolUsuario');

    await signOut(this.auth);
  }

  obtenerUidLocal(): string {
    return localStorage.getItem('uid') || '';
  }

  obtenerRolLocal(): string {
    return localStorage.getItem('rolUsuario') || '';
  }

  obtenerNombreLocal(): string {
    return localStorage.getItem('nombreUsuario') || '';
  }

  obtenerCorreoLocal(): string {
    return localStorage.getItem('correoUsuario') || '';
  }
}
