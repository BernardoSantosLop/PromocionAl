import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class RecorteIneService {
  readonly solicitud = signal<{ origen: Blob | string; titulo: string } | null>(null);
  private resolver?: (imagen: Blob | null) => void;

  editar(origen: Blob | string, titulo = 'Ajustar foto de INE'): Promise<Blob | null> {
    if (this.solicitud()) return Promise.resolve(null);
    if (typeof origen !== 'string' && (!['image/jpeg', 'image/png', 'image/webp'].includes(origen.type) || origen.size > 12 * 1024 * 1024))
      return Promise.reject(new Error('Selecciona una imagen JPG, PNG o WebP de hasta 12 MB.'));
    if (typeof origen === 'string' && !/^data:image\/(jpeg|png|webp);base64,/.test(origen))
      return Promise.reject(new Error('La imagen de INE no es válida.'));
    return new Promise((resolve) => {
      this.resolver = resolve;
      this.solicitud.set({ origen, titulo });
    });
  }

  terminar(imagen: Blob | null): void {
    const resolver = this.resolver;
    this.resolver = undefined;
    this.solicitud.set(null);
    resolver?.(imagen);
  }
}
