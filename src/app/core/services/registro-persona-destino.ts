import { InjectionToken, inject } from '@angular/core';
import { NuevoVotante } from '../models/votante.model';
import { VotantesService } from './votantes.service';

export interface DatosRegistroPersona extends NuevoVotante {
  fechaCapturaLocal?: string;
  origenCaptura?: string;
}

export interface DestinoRegistroPersona {
  tipo: 'simpatizante' | 'rg';
  nombreBaseDatos: string;
  registrar(datos: DatosRegistroPersona): Promise<string>;
}

export const REGISTRO_PERSONA_DESTINO = new InjectionToken<DestinoRegistroPersona>(
  'Destino del registro de persona',
  {
    providedIn: 'root',
    factory: () => {
      const servicio = inject(VotantesService);
      return {
        tipo: 'simpatizante',
        nombreBaseDatos: 'promocion-voto-ine-offline',
        registrar: (datos) => servicio.registrarVotante(datos),
      };
    },
  },
);
