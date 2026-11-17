import { RecorteIneService } from '../../../core/services/recorte-ine.service';
import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FichaRegistroEnlace } from '../../../core/models/usuario-sistema.model';
import { Colonia } from '../../../core/models/colonia.model';
import { IneOcrService } from '../../../core/services/ine-ocr.service';

@Component({
  selector: 'app-datos-movilizador',
  imports: [CommonModule, FormsModule],
  styleUrl: './datos-movilizador.css',
  template: `
    <fieldset [disabled]="bloqueado || procesando"><legend>Formato de registro del movilizador</legend>
      <div class="lectura">
        <p>Extrae los datos del frente de la INE tomando una foto o cargando una imagen.</p>
        <input hidden type="file" accept="image/jpeg,image/png,image/webp" capture="environment" #camara (change)="cargarFrente($event)" />
        <input hidden type="file" accept="image/jpeg,image/png,image/webp" #archivo (change)="cargarFrente($event)" />
        <div class="botones"><button type="button" (click)="camara.click()">Tomar foto del frente</button><button type="button" (click)="archivo.click()">Cargar frente de INE</button><button *ngIf="imagenFrente" type="button" (click)="leerFrente()">Volver a extraer datos</button></div>
        <small *ngIf="procesando" role="status">Leyendo INE…</small>
        <p *ngIf="mensaje" role="status" aria-live="polite">{{ mensaje }}</p>
      </div>
      <div class="campos">
        <label>Domicilio<input name="domicilio" [(ngModel)]="ficha.domicilio" maxlength="250" required /></label>
        <label>Colonia o localidad<input name="colonia" [(ngModel)]="ficha.colonia" [attr.list]="listaId" maxlength="150" required /><datalist [id]="listaId"><option *ngFor="let colonia of colonias" [value]="colonia.nombre"></option></datalist></label>
        <label>C.P.<input name="cp" [(ngModel)]="ficha.codigoPostal" inputmode="numeric" maxlength="5" required /></label>
        <label>Clave de elector<input name="clave" [(ngModel)]="ficha.claveElector" maxlength="18" required /></label>
        <label>CURP<input name="curp" [(ngModel)]="ficha.curp" maxlength="18" required /></label>
        <label>Celular<input name="celular" type="tel" [(ngModel)]="ficha.celular" inputmode="numeric" maxlength="10" required /></label>
        <label>Sección electoral<input name="seccion" type="number" [(ngModel)]="ficha.seccion" min="1" step="1" required /></label>
        <label>Facebook (opcional)<input name="facebook" [(ngModel)]="ficha.facebook" maxlength="150" /></label>
      </div>
      <small>Revisa los datos detectados antes de guardar. Celular, correo y Facebook se capturan manualmente.</small>
    </fieldset>`,
  styles: [`fieldset{margin:18px 0;padding:16px;border:1px solid #d1d5db;border-radius:12px;min-width:0}legend{font-weight:700;padding:0 6px}.campos{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}label{display:flex;flex-direction:column;gap:6px;font-size:14px;color:#374151;font-weight:600;min-width:0}input{width:100%;min-width:0;box-sizing:border-box;height:44px;border:1px solid #d1d5db;border-radius:10px;padding:8px;font:inherit;font-weight:400}small{display:block;margin-top:12px;color:#475569;line-height:1.4}@media(max-width:600px){.campos{grid-template-columns:1fr}}`],
})
export class DatosMovilizador {
  private recorteIne = inject(RecorteIneService);
  @Input({ required: true }) ficha!: FichaRegistroEnlace;
  @Input() colonias: Colonia[] = [];
  @Input() listaId = 'coloniasMovilizador';
  @Input() bloqueado = false;
  @Output() nombreDetectado = new EventEmitter<string>();
  @Output() procesandoChange = new EventEmitter<boolean>();
  private ocr = inject(IneOcrService);
  private cd = inject(ChangeDetectorRef);
  private version = 0;
  private destruido = false;
  imagenFrente = '';
  procesando = false;
  mensaje = '';

  ngOnChanges(cambios: import('@angular/core').SimpleChanges): void {
    if (cambios['ficha']) {
      this.version++;
      this.imagenFrente = '';
      this.mensaje = '';
      this.cambiarProcesando(false);
    }
  }

  ngOnDestroy(): void {
    this.destruido = true;
    this.version++;
    this.procesandoChange.emit(false);
  }

  private cambiarProcesando(valor: boolean): void {
    this.procesando = valor;
    this.procesandoChange.emit(valor);
  }

  async cargarFrente(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const archivo = input.files?.[0];
    if (!archivo || this.procesando || this.bloqueado) return;
    this.mensaje = '';
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(archivo.type) || archivo.size > 12 * 1024 * 1024) {
      this.mensaje = 'Selecciona una imagen JPG, PNG o WebP de hasta 12 MB.';
      input.value = '';
      return;
    }
    const version = ++this.version;
    this.cambiarProcesando(true);
    try {
      const recortada = await this.recorteIne.editar(archivo);
      if (!recortada) return;
      const bitmap = await createImageBitmap(recortada, { imageOrientation: 'from-image' });
      const escala = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * escala));
      canvas.height = Math.max(1, Math.round(bitmap.height * escala));
      const contexto = canvas.getContext('2d');
      if (!contexto) { bitmap.close(); throw new Error('No se pudo preparar la imagen.'); }
      contexto.fillStyle = '#fff';
      contexto.fillRect(0, 0, canvas.width, canvas.height);
      contexto.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      if (this.destruido || version !== this.version) return;
      this.imagenFrente = canvas.toDataURL('image/jpeg', 0.85);
      await this.extraerDatos(version);
    } catch (error) {
      if (!this.destruido && version === this.version) this.mensaje = error instanceof Error ? error.message : 'No se pudo procesar la foto.';
    } finally {
      input.value = '';
      if (!this.destruido && version === this.version) { this.cambiarProcesando(false); this.cd.detectChanges(); }
    }
  }

  async leerFrente(): Promise<void> {
    if (!this.imagenFrente || this.procesando || this.bloqueado) return;
    const version = ++this.version;
    this.cambiarProcesando(true);
    try { await this.extraerDatos(version); }
    finally { if (!this.destruido && version === this.version) { this.cambiarProcesando(false); this.cd.detectChanges(); } }
  }

  private async extraerDatos(version: number): Promise<void> {
    this.mensaje = '';
    if (!navigator.onLine) { this.mensaje = 'Necesitas internet para extraer los datos. La foto queda disponible para reintentar; también puedes llenar los campos manualmente.'; return; }
    const ficha = this.ficha;
    try {
      const respuesta = await this.ocr.leerIne(this.imagenFrente);
      if (this.destruido || version !== this.version || ficha !== this.ficha) return;
      if (!respuesta.ok || !respuesta.datos) throw new Error('No se detectaron datos claros. Intenta otra foto o llena los campos manualmente.');
      const datos = respuesta.datos;
      const campos: string[] = [];
      if (datos.nombreCompleto?.trim()) { this.nombreDetectado.emit(datos.nombreCompleto.trim()); campos.push('nombre'); }
      if (datos.direccion?.trim()) { ficha.domicilio = datos.direccion.trim(); campos.push('domicilio'); }
      if (datos.claveElector?.trim()) { ficha.claveElector = datos.claveElector.trim().toUpperCase(); campos.push('clave de elector'); }
      if (datos.curp?.trim()) { ficha.curp = datos.curp.trim().toUpperCase(); campos.push('CURP'); }
      if (Number.isInteger(datos.seccion) && Number(datos.seccion) > 0) { ficha.seccion = Number(datos.seccion); campos.push('sección'); }
      if (datos.colonia?.trim()) {
        const normalizar = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase().replace(/\s+/g, ' ');
        const colonia = this.colonias.find((c) => normalizar(c.nombre) === normalizar(datos.colonia) && (!ficha.seccion || !c.secciones?.length || c.secciones.includes(ficha.seccion)));
        ficha.colonia = colonia?.nombre || datos.colonia.trim();
        campos.push('colonia o localidad');
      }
      const cp = datos.codigoPostal?.match(/^\d{5}$/)?.[0] || datos.direccion?.match(/\b(\d{5})\b/)?.[1] || respuesta.texto?.match(/\bC\.?\s*P\.?\s*:?\s*(\d{5})\b/i)?.[1];
      if (cp) { ficha.codigoPostal = cp; campos.push('código postal'); }
      this.mensaje = campos.length ? `Datos extraídos: ${campos.join(', ')}. Revisa la información antes de guardar.` : 'No se detectaron datos claros. Prueba otra foto o captura los datos manualmente.';
    } catch (error) {
      if (!this.destruido && version === this.version) this.mensaje = `No se pudo leer la INE. ${error instanceof Error ? error.message : 'Intenta de nuevo o llena los campos manualmente.'}`;
    }
  }
}
