import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, ViewChild, effect, inject } from '@angular/core';
import { DialogosService } from '../../../core/services/dialogos.service';

@Component({
  selector: 'app-dialogo',
  imports: [CommonModule],
  template: `
    <dialog #modal aria-labelledby="dialogo-titulo" aria-describedby="dialogo-mensaje" (cancel)="cancelar($event)">
      <section *ngIf="dialogos.actual() as solicitud" [class.peligro]="solicitud.peligro">
        <div class="encabezado"><span class="icono" aria-hidden="true">{{ solicitud.peligro ? '!' : solicitud.informativo ? 'i' : '?' }}</span><button type="button" class="cerrar" aria-label="Cerrar aviso" (click)="responder(false)">×</button></div>
        <p class="etiqueta">{{ solicitud.informativo ? 'Información' : 'Revisa antes de continuar' }}</p>
        <h2 id="dialogo-titulo">{{ solicitud.titulo }}</h2>
        <p id="dialogo-mensaje">{{ solicitud.mensaje }}</p>
        <footer>
          <button *ngIf="!solicitud.informativo" type="button" class="cancelar" autofocus (click)="responder(false)">Cancelar</button>
          <button type="button" class="aceptar" [attr.autofocus]="solicitud.informativo ? '' : null" (click)="responder(true)">{{ solicitud.aceptar }}</button>
        </footer>
      </section>
    </dialog>
  `,
  styleUrl: './dialogo.css',
})
export class Dialogo implements OnDestroy {
  readonly dialogos = inject(DialogosService);
  @ViewChild('modal', { static: true }) modal?: ElementRef<HTMLDialogElement>;
  constructor() {
    effect(() => {
      const solicitud = this.dialogos.actual();
      queueMicrotask(() => {
        const modal = this.modal?.nativeElement;
        if (!modal?.isConnected) return;
        if (solicitud && !modal.open) modal.showModal();
        else if (!solicitud && modal.open) modal.close();
      });
    });
  }
  responder(aceptado: boolean): void { this.dialogos.responder(aceptado); }
  cancelar(event: Event): void { event.preventDefault(); this.responder(false); }
  ngOnDestroy(): void {
    const modal = this.modal?.nativeElement;
    if (modal?.open) modal.close();
    this.dialogos.responder(false);
  }
}
