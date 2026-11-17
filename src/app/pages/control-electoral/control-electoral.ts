import { DialogosService } from '../../core/services/dialogos.service';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription } from 'rxjs';
import { ControlElectoralService } from '../../core/services/control-electoral.service';
import { ControlElectoralNav } from '../../shared/components/control-electoral-nav/control-electoral-nav';
import {
  FilaCasilla,
  SeccionAsignada,
  TIPOS_CASILLA,
  nombreCasilla,
  validarSeccionAsignada,
} from '../../core/models/seccion-asignada.model';

@Component({
  selector: 'app-control-electoral',
  imports: [CommonModule, FormsModule, ControlElectoralNav],
  templateUrl: './control-electoral.html',
  styleUrl: './control-electoral.css',
})
export class ControlElectoral {
  private dialogos = inject(DialogosService);
  private servicio = inject(ControlElectoralService);
  private destroyRef = inject(DestroyRef);
  private suscripcion?: Subscription;
  private siguienteClave = 0;
  tiposCasilla = TIPOS_CASILLA;
  nombreCasilla = nombreCasilla;
  secciones = signal<SeccionAsignada[]>([]);
  cargando = signal(true);
  errorCarga = signal('');
  mensajeError = signal('');
  mensajeExito = signal('');
  guardando = signal(false);
  eliminandoId = signal('');
  editandoId = signal('');
  busqueda = signal('');
  filtroRuta = signal('');
  formulario = {
    seccion: null as number | null,
    numeroRuta: null as number | null,
    casillas: [this.nuevaCasilla()],
  };
  rutas = computed(() =>
    [...new Set(this.secciones().map((seccion) => seccion.numeroRuta))].sort((a, b) => a - b),
  );
  totalCasillas = computed(() =>
    this.secciones().reduce((total, seccion) => total + seccion.casillas.length, 0),
  );
  totalSeccionesUnicas = computed(() => new Set(this.secciones().map((registro) => registro.seccion)).size);
  seccionesFiltradas = computed(() => {
    const texto = this.normalizar(this.busqueda());
    return this.secciones().filter((seccion) => {
      const coincideRuta = !this.filtroRuta() || String(seccion.numeroRuta) === this.filtroRuta();
      const contenido = `${seccion.seccion} ruta ${seccion.numeroRuta} ${seccion.casillas.map((casilla) => `${nombreCasilla(casilla)} ${casilla.tipo}`).join(' ')}`;
      return coincideRuta && (!texto || this.normalizar(contenido).includes(texto));
    });
  });

  gruposPorRuta = computed(() => {
    const grupos = new Map<number, SeccionAsignada[]>();
    for (const seccion of this.seccionesFiltradas()) {
      const grupo = grupos.get(seccion.numeroRuta) || [];
      grupo.push(seccion);
      grupos.set(seccion.numeroRuta, grupo);
    }
    return [...grupos.entries()]
      .sort(([a], [b]) => a - b)
      .map(([numeroRuta, secciones]) => ({
        numeroRuta,
        secciones: [...secciones].sort((a, b) => a.seccion - b.seccion),
        totalCasillas: secciones.reduce((total, seccion) => total + seccion.casillas.length, 0),
      }));
  });

  constructor() {
    this.cargar();
  }

  cargar(): void {
    this.suscripcion?.unsubscribe();
    this.cargando.set(true);
    this.errorCarga.set('');
    this.suscripcion = this.servicio
      .obtenerSeccionesAsignadas()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (secciones) => {
          this.secciones.set(secciones);
          this.cargando.set(false);
          this.errorCarga.set('');
        },
        error: () => {
          this.cargando.set(false);
          this.errorCarga.set(
            'No se pudieron cargar las secciones. Revisa tu conexión o los permisos de Control Electoral.',
          );
        },
      });
  }

  private nuevaCasilla(): FilaCasilla {
    return {
      clave: ++this.siguienteClave,
      tipo: 'basica',
      numero: 1,
      numeroContigua: null,
    };
  }

  agregarCasilla(): void {
    const nueva = this.nuevaCasilla();
    nueva.tipo = 'contigua';
    nueva.numero =
      Math.max(
        0,
        ...this.formulario.casillas
          .filter((casilla) => casilla.tipo === 'contigua')
          .map((casilla) => casilla.numero || 0),
      ) + 1;
    this.formulario.casillas.push(nueva);
  }

  quitarCasilla(clave: number): void {
    if (this.formulario.casillas.length > 1)
      this.formulario.casillas = this.formulario.casillas.filter(
        (casilla) => casilla.clave !== clave,
      );
  }

  async guardar(): Promise<void> {
    if (this.guardando() || this.eliminandoId()) return;
    this.mensajeError.set('');
    this.mensajeExito.set('');
    try {
      const casillas = validarSeccionAsignada(
        this.formulario.seccion,
        this.formulario.numeroRuta,
        this.formulario.casillas,
      );
      this.guardando.set(true);
      await this.servicio.guardarSeccion(
        this.formulario.seccion!,
        this.formulario.numeroRuta!,
        casillas.map((casilla, indice) => ({ ...casilla, clave: indice })),
        this.editandoId(),
      );
      const editando = Boolean(this.editandoId());
      const numeroRuta = this.formulario.numeroRuta;
      this.limpiar(numeroRuta);
      this.mensajeExito.set(
        editando
          ? 'Sección y casillas actualizadas correctamente.'
          : 'Casillas registradas en la ruta. Si la sección ya existía, se agregaron a sus casillas anteriores.',
      );
    } catch (error) {
      const codigo = (error as { code?: string })?.code;
      this.mensajeError.set(
        codigo === 'permission-denied'
          ? 'Tu cuenta no tiene permiso para guardar en Control Electoral.'
          : error instanceof Error
            ? error.message
            : 'No se pudo guardar la sección.',
      );
    } finally {
      this.guardando.set(false);
    }
  }

  editar(registro: SeccionAsignada): void {
    if (this.guardando() || this.eliminandoId()) return;
    this.editandoId.set(registro.id);
    this.formulario = {
      seccion: registro.seccion,
      numeroRuta: registro.numeroRuta,
      casillas: registro.casillas.map((casilla) => ({ ...casilla, clave: ++this.siguienteClave })),
    };
    this.mensajeError.set('');
    this.mensajeExito.set('');
    document
      .getElementById('registro-seccion-electoral')
      ?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }

  limpiar(numeroRuta: number | null = null): void {
    this.editandoId.set('');
    this.formulario = { seccion: null, numeroRuta, casillas: [this.nuevaCasilla()] };
    this.mensajeError.set('');
    this.mensajeExito.set('');
  }

  async eliminar(registro: SeccionAsignada): Promise<void> {
    if (this.guardando() || this.eliminandoId()) return;
    if (
      !(await this.dialogos.confirmar(`¿Eliminar la sección ${registro.seccion} y sus ${registro.casillas.length} casilla(s) de la Ruta ${registro.numeroRuta}? Esta acción no se puede deshacer.`))
    )
      return;
    this.eliminandoId.set(registro.id);
    this.mensajeError.set('');
    this.mensajeExito.set('');
    try {
      await this.servicio.eliminarSeccion(registro.id);
      if (this.editandoId() === registro.id) this.limpiar();
      this.mensajeExito.set(`Sección ${registro.seccion} eliminada de la Ruta ${registro.numeroRuta}.`);
    } catch {
      this.mensajeError.set('No se pudo eliminar la sección. Revisa tu conexión y tus permisos.');
    } finally {
      this.eliminandoId.set('');
    }
  }

  private normalizar(valor: string): string {
    return valor
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }
}
