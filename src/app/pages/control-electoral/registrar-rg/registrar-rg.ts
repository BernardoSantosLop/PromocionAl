import { Component, inject } from '@angular/core';
import { RegistroVotante } from '../../registro-votante/registro-votante';
import { ControlElectoralNav } from '../../../shared/components/control-electoral-nav/control-electoral-nav';
import {
  REGISTRO_PERSONA_DESTINO,
  DestinoRegistroPersona,
} from '../../../core/services/registro-persona-destino';
import { RegistroRgService } from '../../../core/services/registro-rg.service';

@Component({
  selector: 'app-registrar-rg',
  imports: [RegistroVotante, ControlElectoralNav],
  providers: [
    {
      provide: REGISTRO_PERSONA_DESTINO,
      useFactory: (): DestinoRegistroPersona => {
        const servicio = inject(RegistroRgService);
        return {
          tipo: 'rg',
          nombreBaseDatos: 'control-electoral-rg-ine-offline',
          registrar: (datos) => servicio.registrar(datos),
        };
      },
    },
  ],
  templateUrl: './registrar-rg.html',
  styleUrl: './registrar-rg.css',
})
export class RegistrarRg {}
