import { DialogosService } from '../../../core/services/dialogos.service';
import { ColoniasService } from '../../../core/services/colonias.service';
import { Colonia } from '../../../core/models/colonia.model';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { combineLatest, Subscription } from 'rxjs';
import { ControlElectoralNav } from '../../../shared/components/control-electoral-nav/control-electoral-nav';
import { RegistroRgService } from '../../../core/services/registro-rg.service';
import { ControlElectoralService } from '../../../core/services/control-electoral.service';
import {
  RgCapturado,
  agruparRutasElectorales,
  numeroRutaValido,
} from '../../../core/models/asignacion-rg.model';
import { SeccionAsignada, nombreCasilla } from '../../../core/models/seccion-asignada.model';
import { crearHojaRutaHtml } from '../../../core/printing/hoja-ruta';
import { ImpresionRutaService } from '../../../core/printing/impresion-ruta.service';

@Component({
  selector: 'app-asignar-rutas',
  imports: [CommonModule, FormsModule, RouterLink, ControlElectoralNav],
  templateUrl: './asignar-rutas.html',
  styleUrl: './asignar-rutas.css',
})
export class AsignarRutas {
  private dialogos = inject(DialogosService);
  private servicioRg = inject(RegistroRgService);
  private coloniasService = inject(ColoniasService);
  colonias = signal<Colonia[]>([]);
  private control = inject(ControlElectoralService);
  private destroyRef = inject(DestroyRef);
  private impresion = inject(ImpresionRutaService);
  private suscripcion?: Subscription;
  rgs = signal<RgCapturado[]>([]);
  secciones = signal<SeccionAsignada[]>([]);
  cargando = signal(true);
  errorCarga = signal('');
  error = signal('');
  exito = signal('');
  guardandoId = signal('');
  busqueda = signal('');
  filtroRuta = signal('');
  selecciones = signal<Record<string, string>>({});
  nombreCasilla = nombreCasilla;
  rutas = computed(() => agruparRutasElectorales(this.secciones()));
  numerosRutas = computed(() => new Set(this.rutas().map((ruta) => ruta.numeroRuta)));
  asignados = computed(
    () =>
      this.rgs().filter(
        (rg) => rg.numeroRutaAsignada !== null && this.numerosRutas().has(rg.numeroRutaAsignada),
      ).length,
  );
  pendientes = computed(() => this.rgs().length - this.asignados());
  rgsFiltrados = computed(() => {
    const texto = this.normalizar(this.busqueda());
    return this.rgs().filter((rg) => {
      const filtro = this.filtroRuta();
      const rutaVigente =
        rg.numeroRutaAsignada !== null && this.numerosRutas().has(rg.numeroRutaAsignada);
      const coincideRuta =
        !filtro ||
        (filtro === 'pendientes' ? !rutaVigente : String(rg.numeroRutaAsignada) === filtro);
      return (
        coincideRuta &&
        (!texto ||
          this.normalizar(
            `${rg.nombreCompleto} ${rg.telefono} ${rg.claveElector} ${rg.seccion} ${rg.colonia}`,
          ).includes(texto))
      );
    });
  });

  constructor() {
    this.cargar();
    this.destroyRef.onDestroy(() => this.impresion.limpiar());
  }

  imprimirRuta(numeroRuta: number): void {
    if (this.guardandoId() || this.cargando()) return;
    const ruta = this.rutas().find((registro) => registro.numeroRuta === numeroRuta);
    const responsables = this.rgsDeRuta(numeroRuta);
    if (!ruta || responsables.length !== 1) {
      this.error.set('Asigna un solo RG a la ruta antes de imprimir su hoja.');
      return;
    }
    this.error.set('');
    this.impresion.imprimir(crearHojaRutaHtml(ruta, responsables[0], new Date(), this.colonias()));
  }

  cargar(): void {
    this.suscripcion?.unsubscribe();
    this.cargando.set(true);
    this.errorCarga.set('');
    this.suscripcion = combineLatest([
      this.servicioRg.obtenerRgs(),
      this.control.obtenerSeccionesAsignadas(),
      this.coloniasService.obtenerColonias(),
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ([rgs, secciones, colonias]) => {
          this.colonias.set(colonias);
          this.rgs.set(rgs);
          this.secciones.set(secciones);
          this.cargando.set(false);
        },
        error: () => {
          this.cargando.set(false);
          this.errorCarga.set(
            'No se pudieron cargar los RG, las rutas y las colonias. Revisa tu conexión y vuelve a intentar.',
          );
        },
      });
  }

  seleccion(rg: RgCapturado): string {
    return (
      this.selecciones()[rg.id] ??
      (rg.numeroRutaAsignada === null ? '' : String(rg.numeroRutaAsignada))
    );
  }

  seleccionar(rg: RgCapturado, valor: string): void {
    this.selecciones.update((selecciones) => ({ ...selecciones, [rg.id]: valor }));
    this.error.set('');
    this.exito.set('');
  }

  tieneCambio(rg: RgCapturado): boolean {
    const ruta = numeroRutaValido(this.seleccion(rg));
    return (
      ruta !== null &&
      this.numerosRutas().has(ruta) &&
      ruta !== rg.numeroRutaAsignada &&
      !this.rutaOcupada(ruta, rg.id)
    );
  }

  rutaOcupada(numeroRuta: number, idRg: string): boolean {
    return this.rgs().some(
      (registro) => registro.id !== idRg && registro.numeroRutaAsignada === numeroRuta,
    );
  }

  rgsDeRuta(numeroRuta: number): RgCapturado[] {
    return this.rgs().filter((rg) => rg.numeroRutaAsignada === numeroRuta);
  }

  async asignar(rg: RgCapturado): Promise<void> {
    if (this.guardandoId() || !this.tieneCambio(rg)) return;
    const ruta = numeroRutaValido(this.seleccion(rg))!;
    if (
      rg.numeroRutaAsignada !== null &&
      !(await this.dialogos.confirmar(`¿Cambiar a ${rg.nombreCompleto} de la Ruta ${rg.numeroRutaAsignada} a la Ruta ${ruta}?`))
    )
      return;
    await this.guardar(rg, ruta);
  }

  async quitar(rg: RgCapturado): Promise<void> {
    if (this.guardandoId() || rg.numeroRutaAsignada === null) return;
    if (
      !(await this.dialogos.confirmar(`¿Quitar la Ruta ${rg.numeroRutaAsignada} asignada a ${rg.nombreCompleto}? El RG seguirá registrado.`))
    )
      return;
    await this.guardar(rg, null);
  }

  private async guardar(rg: RgCapturado, numeroRuta: number | null): Promise<void> {
    this.guardandoId.set(rg.id);
    this.error.set('');
    this.exito.set('');
    try {
      await this.servicioRg.asignarRuta(rg.id, numeroRuta, rg.numeroRutaAsignada);
      this.rgs.update((rgs) =>
        rgs.map((registro) =>
          registro.id === rg.id ? { ...registro, numeroRutaAsignada: numeroRuta } : registro,
        ),
      );
      this.selecciones.update((selecciones) => {
        const copia = { ...selecciones };
        delete copia[rg.id];
        return copia;
      });
      this.exito.set(
        numeroRuta === null
          ? `Se quitó la ruta de ${rg.nombreCompleto}.`
          : `Ruta ${numeroRuta} asignada a ${rg.nombreCompleto}.`,
      );
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo guardar la asignación.');
    } finally {
      this.guardandoId.set('');
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
