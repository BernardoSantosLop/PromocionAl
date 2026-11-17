import { Injectable, signal } from '@angular/core';

export interface SolicitudDialogo {
  mensaje: string;
  titulo: string;
  aceptar: string;
  peligro: boolean;
  informativo: boolean;
  resolver: (aceptado: boolean) => void;
}

@Injectable({ providedIn: 'root' })
export class DialogosService {
  readonly actual = signal<SolicitudDialogo | null>(null);
  private cola: SolicitudDialogo[] = [];

  confirmar(mensaje: string, opciones: { titulo?: string; aceptar?: string; peligro?: boolean } = {}): Promise<boolean> {
    return this.solicitar(mensaje, opciones, false);
  }

  avisar(mensaje: string): Promise<boolean> {
    return this.solicitar(mensaje, { titulo: 'Sin datos para exportar', aceptar: 'Entendido' }, true);
  }

  private solicitar(mensaje: string, opciones: { titulo?: string; aceptar?: string; peligro?: boolean }, informativo: boolean): Promise<boolean> {
    // Repeated clicks must not enqueue the same destructive action twice.
    if (this.actual()?.mensaje === mensaje || this.cola.some((solicitud) => solicitud.mensaje === mensaje))
      return Promise.resolve(false);
    return new Promise((resolver) => {
      const peligro = opciones.peligro ?? /eliminar|borrar/i.test(mensaje);
      const solicitud: SolicitudDialogo = {
        mensaje,
        titulo: opciones.titulo || (peligro ? 'Confirmar eliminación' : 'Confirmar cambio'),
        aceptar: opciones.aceptar || (peligro ? 'Sí, eliminar' : 'Confirmar'),
        peligro,
        informativo,
        resolver,
      };
      if (this.actual()) this.cola.push(solicitud);
      else this.actual.set(solicitud);
    });
  }

  responder(aceptado: boolean): void {
    const solicitud = this.actual();
    if (!solicitud) return;
    this.actual.set(this.cola.shift() || null);
    solicitud.resolver(aceptado);
  }
}
