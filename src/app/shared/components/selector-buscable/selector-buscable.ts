import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, HostListener, Input, Output, ViewChild, inject } from '@angular/core';

@Component({
  selector: 'app-selector-buscable',
  imports: [CommonModule],
  template: `
    <button #trigger type="button" class="selector" [disabled]="disabled" [attr.aria-label]="label + ': ' + seleccionado" [attr.aria-expanded]="abierto" aria-haspopup="listbox" (click)="alternar()" (keydown.arrowdown)="$event.preventDefault(); abrir()">
      {{ seleccionado }} <span aria-hidden="true">▾</span>
    </button>
    <div class="panel" *ngIf="abierto">
      <input #buscador type="search" role="combobox" [attr.aria-label]="'Buscar ' + label" aria-autocomplete="list" aria-expanded="true" [attr.aria-controls]="listaId" [attr.aria-activedescendant]="filtradas[indice] ? listaId + '-' + indice : null" [value]="busqueda" (input)="buscar($event)" (keydown)="teclado($event)" placeholder="Escribe para buscar…" autocomplete="off">
      <div class="opciones" role="listbox" [id]="listaId" [attr.aria-label]="label">
        <div *ngFor="let opcion of filtradas; let i = index" role="option" [id]="listaId + '-' + i" [attr.aria-selected]="opcion.uid === value" [class.resaltada]="i === indice" (mousedown)="$event.preventDefault()" (click)="seleccionar(opcion.uid)">
          {{ opcion.nombre }}{{ opcion.activo === false ? ' (inactivo)' : '' }}
        </div>
        <p *ngIf="!filtradas.length" role="status">Sin coincidencias</p>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; position: relative; min-width: 0; }
    .selector, input { box-sizing: border-box; width: 100%; min-height: 44px; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 10px; background: white; color: #1f2937; font: inherit; }
    .selector { display: flex; justify-content: space-between; gap: 8px; text-align: left; cursor: pointer; }
    .selector:disabled { background: #f3f4f6; color: #6b7280; cursor: not-allowed; }
    button:focus-visible, input:focus { outline: 2px solid #2563eb; outline-offset: 2px; }
    .panel { position: absolute; z-index: 20; top: calc(100% + 4px); left: 0; right: 0; padding: 8px; border: 1px solid #d1d5db; border-radius: 12px; background: white; box-shadow: 0 8px 24px #0002; }
    .opciones { max-height: 240px; overflow-y: auto; margin-top: 8px; }
    [role=option] { padding: 12px; border-radius: 6px; cursor: pointer; overflow-wrap: anywhere; }
    [role=option]:hover, .resaltada { background: #eff6ff; color: #1d4ed8; }
    [aria-selected=true] { font-weight: 700; }
    p { padding: 12px; margin: 0; color: #6b7280; }
  `],
})
export class SelectorBuscable {
  private static siguienteId = 0;
  private host = inject(ElementRef<HTMLElement>);
  @Input() opciones: { uid: string; nombre: string; activo?: boolean }[] = [];
  @Input() value = '';
  @Input() label = '';
  @Input() placeholder = 'Selecciona una opción';
  @Input() disabled = false;
  @Output() valueChange = new EventEmitter<string>();
  @ViewChild('buscador') buscador?: ElementRef<HTMLInputElement>;
  @ViewChild('trigger') trigger?: ElementRef<HTMLButtonElement>;
  readonly listaId = `selector-lista-${SelectorBuscable.siguienteId++}`;
  abierto = false;
  busqueda = '';
  indice = 0;
  get seleccionado(): string { return this.opciones.find(opcion => opcion.uid === this.value)?.nombre || this.placeholder; }
  get filtradas() {
    const normalizar = (texto: string) => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    return this.opciones.filter(opcion => normalizar(opcion.nombre).includes(normalizar(this.busqueda)));
  }
  abrir(): void {
    if (this.disabled) return;
    this.abierto = true;
    this.busqueda = '';
    this.indice = 0;
    setTimeout(() => this.buscador?.nativeElement.focus());
  }
  alternar(): void { if (this.abierto) this.abierto = false; else this.abrir(); }
  buscar(event: Event): void { this.busqueda = (event.target as HTMLInputElement).value; this.indice = 0; }
  seleccionar(uid: string): void { this.valueChange.emit(uid); this.abierto = false; this.trigger?.nativeElement.focus(); }
  teclado(event: KeyboardEvent): void {
    if (event.key === 'Escape') { event.preventDefault(); this.abierto = false; this.trigger?.nativeElement.focus(); }
    else if (event.key === 'Tab') this.abierto = false;
    else if (event.key === 'Enter') { event.preventDefault(); const opcion = this.filtradas[this.indice]; if (opcion) this.seleccionar(opcion.uid); }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.indice = Math.max(0, Math.min(this.filtradas.length - 1, this.indice + (event.key === 'ArrowDown' ? 1 : -1)));
      this.host.nativeElement.querySelector(`#${this.listaId}-${this.indice}`)?.scrollIntoView({ block: 'nearest' });
    }
  }
  @HostListener('document:click', ['$event']) cerrarFuera(event: Event): void {
    if (!this.host.nativeElement.contains(event.target as Node)) this.abierto = false;
  }
}
