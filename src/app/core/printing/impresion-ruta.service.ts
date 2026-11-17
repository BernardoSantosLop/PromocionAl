import { Injectable } from '@angular/core';
import { ajustarHojasCarta } from './carta';
import { orientarIneParaImprimir } from './imagen-ine';

@Injectable({ providedIn: 'root' })
export class ImpresionRutaService {
  private frame: HTMLIFrameElement | null = null;

  imprimir(html: string, titulo = 'Hoja de ruta para imprimir'): void {
    this.limpiar();
    const frame = document.createElement('iframe');
    frame.title = titulo;
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText =
      'position:fixed;width:816px;height:1056px;border:0;top:0;left:-10000px;visibility:hidden;';
    let preparando = false;
    frame.onload = async () => {
      const ventana = frame.contentWindow;
      if (!ventana || this.frame !== frame || preparando) return;
      preparando = true;
      const documento = ventana.document;
      await documento.fonts?.ready;
      await Promise.all(Array.from(documento.images).map((imagen) =>
        imagen.decode ? imagen.decode().catch(() => undefined) : Promise.resolve(),
      ));
      if (this.frame !== frame) return;
      await orientarIneParaImprimir(documento);
      if (this.frame !== frame) return;
      ajustarHojasCarta(documento);
      ventana.addEventListener(
        'afterprint',
        () => {
          if (this.frame === frame) this.limpiar();
        },
        { once: true },
      );
      ventana.focus();
      ventana.print();
    };
    this.frame = frame;
    frame.srcdoc = html;
    document.body.appendChild(frame);
  }

  limpiar(): void {
    this.frame?.remove();
    this.frame = null;
  }
}
