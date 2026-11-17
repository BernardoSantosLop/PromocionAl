import { EsquinaRecorte, EsquinasRecorte, ORDEN_ESQUINAS, esquinasCompletas, recorteValido, recortarPerspectiva } from '../../../core/images/recorte-perspectiva';
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, OnDestroy, ViewChild, effect, inject } from '@angular/core';
import { RecorteIneService } from '../../../core/services/recorte-ine.service';

type Tirador = EsquinaRecorte;

@Component({
  selector: 'app-recorte-ine',
  imports: [CommonModule],
  templateUrl: './recorte-ine.html',
  styleUrl: './recorte-ine.css',
})
export class RecorteIne implements OnDestroy {
  readonly servicio = inject(RecorteIneService);
  private cd = inject(ChangeDetectorRef);
  @ViewChild('modal', { static: true }) modal!: ElementRef<HTMLDialogElement>;
  @ViewChild('escenario') escenario?: ElementRef<HTMLElement>;
  readonly tiradores: Tirador[] = ['nw', 'ne', 'se', 'sw'];
  readonly nombresEsquina = { nw: 'superior izquierda', ne: 'superior derecha', se: 'inferior derecha', sw: 'inferior izquierda' };
  vista = '';
  error = '';
  cargando = false;
  guardando = false;
  lienzo?: HTMLCanvasElement;
  esquinas = esquinasCompletas();
  get poligono(): string { return ORDEN_ESQUINAS.map(k => `${this.esquinas[k].x},${this.esquinas[k].y}`).join(' '); }
  get mascara(): string { return `M0 0H100V100H0Z M${ORDEN_ESQUINAS.map(k => `${this.esquinas[k].x} ${this.esquinas[k].y}`).join('L')}Z`; }
  private version = 0;
  private arrastre?: { id: number; modo: string; x: number; y: number; inicial: EsquinasRecorte };

  constructor() {
    effect(() => {
      const solicitud = this.servicio.solicitud();
      const version = ++this.version;
      queueMicrotask(async () => {
        if (!this.modal.nativeElement.isConnected || version !== this.version) return;
        if (!solicitud) { if (this.modal.nativeElement.open) this.modal.nativeElement.close(); this.vista = ''; this.lienzo = undefined; return; }
        this.error = ''; this.vista = ''; this.cargando = true; this.guardando = false;
        this.modal.nativeElement.showModal();
        try {
          const blob = typeof solicitud.origen === 'string' ? await (await fetch(solicitud.origen)).blob() : solicitud.origen;
          const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
          try {
            if (version !== this.version) return;
            const escala = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(bitmap.width * escala);
            canvas.height = Math.round(bitmap.height * escala);
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('No se pudo abrir la imagen.');
            ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(bitmap, 0, 0, bitmap.width * escala, bitmap.height * escala);
            this.lienzo = canvas; this.actualizarVista();
          } finally { bitmap.close(); }
        } catch { if (version === this.version) this.error = 'No se pudo abrir la foto. Cancela y selecciona otra imagen.'; }
        finally { if (version === this.version) { this.cargando = false; this.cd.markForCheck(); } }
      });
    });
  }

  private actualizarVista(): void {
    if (!this.lienzo) return;
    this.vista = this.lienzo.toDataURL('image/jpeg', .9);
    this.restablecer();
  }

  restablecer(): void { this.esquinas = esquinasCompletas(); }

  ajustarEsquina(esquina: Tirador, x: number, y: number): void {
    const siguientes = { ...this.esquinas, [esquina]: { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) } };
    if (recorteValido(siguientes)) this.esquinas = siguientes;
  }

  deslizador(esquina: Tirador, eje: 'x' | 'y', event: Event): void {
    const p = this.esquinas[esquina];
    const valor = Number((event.target as HTMLInputElement).value);
    this.ajustarEsquina(esquina, eje === 'x' ? valor : p.x, eje === 'y' ? valor : p.y);
  }

  girar(sentido: number): void {
    if (!this.lienzo) return;
    const canvas = document.createElement('canvas');
    canvas.width = this.lienzo.height; canvas.height = this.lienzo.width;
    const ctx = canvas.getContext('2d')!;
    ctx.translate(sentido > 0 ? canvas.width : 0, sentido > 0 ? 0 : canvas.height);
    ctx.rotate(sentido * Math.PI / 2);
    ctx.drawImage(this.lienzo, 0, 0);
    this.lienzo = canvas; this.actualizarVista();
  }

  empezar(event: PointerEvent, modo: string): void {
    if (event.button !== 0 || this.guardando) return;
    event.preventDefault(); event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.arrastre = { id: event.pointerId, modo, x: event.clientX, y: event.clientY, inicial: structuredClone(this.esquinas) };
  }

  mover(event: PointerEvent): void {
    const a = this.arrastre;
    const rect = this.escenario?.nativeElement.getBoundingClientRect();
    if (!a || !rect || event.pointerId !== a.id) return;
    const dx = (event.clientX - a.x) / rect.width * 100;
    const dy = (event.clientY - a.y) / rect.height * 100;
    if (a.modo === 'mover') {
      const puntos = ORDEN_ESQUINAS.map(k => a.inicial[k]);
      const moverX = Math.max(-Math.min(...puntos.map(p => p.x)), Math.min(100 - Math.max(...puntos.map(p => p.x)), dx));
      const moverY = Math.max(-Math.min(...puntos.map(p => p.y)), Math.min(100 - Math.max(...puntos.map(p => p.y)), dy));
      this.esquinas = Object.fromEntries(ORDEN_ESQUINAS.map(k => [k, { x: a.inicial[k].x + moverX, y: a.inicial[k].y + moverY }])) as EsquinasRecorte;
    } else {
      const esquina = a.modo as Tirador;
      this.ajustarEsquina(esquina, a.inicial[esquina].x + dx, a.inicial[esquina].y + dy);
    }
  }

  terminarArrastre(): void { this.arrastre = undefined; }
  teclado(event: KeyboardEvent, modo: Tirador): void {
    const paso = event.shiftKey ? 5 : 1;
    if (!event.key.startsWith('Arrow')) return;
    event.preventDefault();
    const dx = event.key === 'ArrowRight' ? paso : event.key === 'ArrowLeft' ? -paso : 0;
    const dy = event.key === 'ArrowDown' ? paso : event.key === 'ArrowUp' ? -paso : 0;
    const punto = this.esquinas[modo];
    this.ajustarEsquina(modo, punto.x + dx, punto.y + dy);
  }

  async guardar(): Promise<void> {
    if (!this.lienzo || this.guardando) return;
    this.guardando = true;
    const version = this.version;
    try {
      const canvas = recortarPerspectiva(this.lienzo, this.esquinas);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', .92));
      if (!blob) throw new Error();
      if (version === this.version) this.servicio.terminar(blob);
    } catch { this.error = 'No se pudo recortar la imagen. Intenta ajustar los bordes de nuevo.'; }
    finally { this.guardando = false; this.cd.markForCheck(); }
  }

  cancelar(event?: Event): void { event?.preventDefault(); this.servicio.terminar(null); }
  ngOnDestroy(): void { this.version++; if (this.modal?.nativeElement.open) this.modal.nativeElement.close(); this.servicio.terminar(null); }
}
