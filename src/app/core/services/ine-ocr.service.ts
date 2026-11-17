import { Injectable, inject } from '@angular/core';
import { httpsCallable } from 'firebase/functions';

import { FirebaseService } from '../firebase/firebase.service';

export interface DatosIneOCR {
  nombreCompleto: string;
  direccion: string;
  colonia: string;
  claveElector: string;
  seccion: number | null;
  curp: string;
  edad: number | null;
  codigoPostal?: string;
}

export interface RespuestaIneOCR {
  ok: boolean;
  texto: string;
  datos: DatosIneOCR;
}

@Injectable({
  providedIn: 'root',
})
export class IneOcrService {
  private firebaseService = inject(FirebaseService);

  async leerIne(imagenBase64: string): Promise<RespuestaIneOCR> {
    const functions = this.firebaseService.obtenerFunctions();

    const leerIneCallable = httpsCallable<
      {
        imagenBase64: string;
      },
      RespuestaIneOCR
    >(functions, 'leerIne');

    const respuesta = await leerIneCallable({
      imagenBase64,
    });

    return respuesta.data;
  }
}
