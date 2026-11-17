import { Injectable, inject } from '@angular/core';
import { httpsCallable } from 'firebase/functions';
import { Subject } from 'rxjs';
import { FirebaseService } from '../firebase/firebase.service';
import { RolUsuario, UsuarioSistema } from '../models/usuario-sistema.model';
import { environment } from '../../../environments/environment';

export interface CuentaSinPerfil {
  uid: string;
  correo: string;
  nombre: string;
}

export interface JerarquiaRespuesta {
  rolSolicitante: RolUsuario;
  usuarios: UsuarioSistema[];
  simpatizantesPorMovilizador: Record<string, number>;
  cuentasSinPerfil?: CuentaSinPerfil[];
}

export interface DatosCatalogo {
  seccion: number;
  municipio: string;
  colonia: string;
  confirmar: boolean;
}

export interface EstadoCatalogo {
  faltaSeccion: boolean;
  faltaColonia: boolean;
}

@Injectable({ providedIn: 'root' })
export class JerarquiaService {
  private firebase = inject(FirebaseService);
  private cambiosSubject = new Subject<void>();
  readonly cambios$ = this.cambiosSubject.asObservable();

  notificarCambios(): void {
    this.cambiosSubject.next();
  }

  async listar(): Promise<JerarquiaRespuesta> {
    return this.ejecutar('listar');
  }

  async guardar(usuario: UsuarioSistema, responsableUid: string): Promise<void> {
    await this.ejecutar('guardar', {
      uid: usuario.uid,
      nombre: usuario.nombre.trim(),
      correo: usuario.correo.trim().toLowerCase(),
      rol: usuario.rol,
      responsableUid,
      ...(usuario.fichaRegistro ? { fichaRegistro: usuario.fichaRegistro } : {}),
    });
    this.notificarCambios();
  }

  async recuperarMovilizador(nombre: string, correo: string): Promise<string> {
    const resultado = await this.ejecutar<{ uid: string }>('recuperarMovilizador', {
      nombre,
      correo,
    });
    this.notificarCambios();
    return resultado.uid;
  }

  async asignarCuentaSinPerfil(uid: string, nombre: string, enlaceUid: string): Promise<void> {
    await this.ejecutar('asignarCuentaSinPerfil', { uid, nombre, enlaceUid });
    this.notificarCambios();
  }

  async eliminarUsuario(uid: string): Promise<void> {
    await httpsCallable(this.firebase.obtenerFunctions(), 'eliminarUsuario')({ uid });
    this.notificarCambios();
  }

  async asegurarCatalogos(datos: DatosCatalogo): Promise<EstadoCatalogo> {
    const respuesta = await httpsCallable<DatosCatalogo, EstadoCatalogo>(
      this.firebase.obtenerFunctions(),
      'asegurarCatalogos',
    )(datos);
    return respuesta.data;
  }

  // El endpoint REST crea la cuenta sin reemplazar la sesión del administrador.
  async crearCuenta(correo: string, password: string): Promise<string> {
    if (password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres.');
    const respuesta = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(environment.firebaseConfig.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: correo.trim().toLowerCase(),
          password,
          returnSecureToken: false,
        }),
      },
    );
    const resultado = await respuesta.json();
    if (!respuesta.ok || !resultado.localId) {
      const codigo = String(resultado.error?.message || 'UNKNOWN').split(' : ')[0];
      const mensajes: Record<string, string> = {
        EMAIL_EXISTS: 'Ya existe una cuenta con ese correo.',
        INVALID_EMAIL: 'El correo no es válido.',
        OPERATION_NOT_ALLOWED: 'El registro con correo y contraseña no está habilitado.',
        TOO_MANY_ATTEMPTS_TRY_LATER: 'Se hicieron demasiados intentos. Intenta más tarde.',
        WEAK_PASSWORD: 'La contraseña debe tener al menos 6 caracteres.',
      };
      throw Object.assign(new Error(mensajes[codigo] || 'No se pudo crear la cuenta.'), {
        code: codigo,
      });
    }
    return resultado.localId;
  }

  private async ejecutar<T = JerarquiaRespuesta>(
    accion: string,
    datos: Record<string, unknown> = {},
  ): Promise<T> {
    const respuesta = await httpsCallable<Record<string, unknown>, T>(
      this.firebase.obtenerFunctions(),
      'gestionarJerarquia',
    )({ accion, ...datos });
    return respuesta.data;
  }
}
