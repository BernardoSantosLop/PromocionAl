import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { ImpresionRutaService } from '../../../core/printing/impresion-ruta.service';
import { crearListaSimpatizantesHtml } from '../../../core/printing/lista-simpatizantes';
import { UsuarioSistema } from '../../../core/models/usuario-sistema.model';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { startWith } from 'rxjs';
import {
  construirArbolJerarquia,
  filtrarArbolJerarquia,
} from '../../../core/models/jerarquia.model';
import { JerarquiaRespuesta, JerarquiaService } from '../../../core/services/jerarquia.service';
import { VotantesService } from '../../../core/services/votantes.service';
import { SimpatizanteJerarquia } from '../../../core/models/votante.model';
import { NodoJerarquia } from '../../../core/models/jerarquia.model';

interface ListadoSimpatizantes {
  cargando: boolean;
  datos?: SimpatizanteJerarquia[];
  error?: string;
}

@Component({
  selector: 'app-jerarquia',
  imports: [CommonModule, FormsModule],
  templateUrl: './jerarquia.html',
  styleUrl: './jerarquia.css',
  providers: [ImpresionRutaService],
})
export class Jerarquia implements OnDestroy {
  private impresion = inject(ImpresionRutaService);
  imprimiendo = signal('');
  ngOnDestroy(): void { this.impresion.limpiar(); }

  async imprimirSimpatizantes(movilizador: UsuarioSistema): Promise<void> {
    if (this.imprimiendo()) return;
    this.imprimiendo.set(movilizador.uid);
    this.error.set('');
    try {
      const personas = await this.votantesService.obtenerSimpatizantesDeMovilizador(movilizador.uid);
      if (!personas.length) { this.error.set('Este movilizador todavía no tiene simpatizantes registrados.'); return; }
      this.impresion.imprimir(crearListaSimpatizantesHtml(movilizador, personas), 'Simpatizantes del movilizador · 10 por hoja');
    } catch (error) { this.error.set(error instanceof Error ? error.message : 'No se pudo preparar la impresión.'); }
    finally { this.imprimiendo.set(''); }
  }
  private servicio = inject(JerarquiaService);
  private votantesService = inject(VotantesService);
  private solicitud = 0;
  private versionListados = 0;
  private abiertosAntesDeBuscar: Set<string> | null = null;
  datos = signal<JerarquiaRespuesta | null>(null);
  cargando = signal(false);
  error = signal('');
  busqueda = signal('');
  recuperando = signal('');
  abiertos = signal(new Set<string>());
  listados = signal<Record<string, ListadoSimpatizantes>>({});
  formularios: Record<string, { nombre: string; enlaceUid: string }> = {};
  enlaces = computed(
    () => this.datos()?.usuarios.filter((usuario) => usuario.rol === 'enlace') || [],
  );
  arbolBase = computed(() => {
    const datos = this.datos();
    return datos
      ? construirArbolJerarquia(
          datos.usuarios,
          datos.simpatizantesPorMovilizador,
          datos.rolSolicitante,
        )
      : [];
  });
  arbol = computed(() => filtrarArbolJerarquia(this.arbolBase(), this.busqueda()));
  grupos = computed(() =>
    this.datos()?.rolSolicitante === 'coordinador'
      ? this.arbol().map((coordinador) => ({
          nombre: coordinador.usuario.nombre,
          nodos: coordinador.hijos,
        }))
      : [{ nombre: '', nodos: this.arbol() }],
  );
  hayResultados = computed(() => this.grupos().some((grupo) => grupo.nodos.length > 0));
  resumen = computed(() => {
    const usuarios = this.datos()?.usuarios.filter((usuario) => usuario.activo) || [];
    return {
      delegados: usuarios.filter((usuario) => usuario.rol === 'seccional').length,
      enlaces: usuarios.filter((usuario) => usuario.rol === 'enlace').length,
      movilizadores: usuarios.filter((usuario) => usuario.rol === 'movilizador').length,
    };
  });

  alternar(nodo: NodoJerarquia): void {
    const uid = nodo.usuario.uid;
    const siguientes = new Set(this.abiertos());
    if (siguientes.has(uid)) siguientes.delete(uid);
    else {
      siguientes.add(uid);
      if (nodo.usuario.rol === 'movilizador') void this.cargarSimpatizantes(uid);
    }
    this.abiertos.set(siguientes);
  }

  cambiarBusqueda(valor: string): void {
    const anterior = this.busqueda().trim();
    this.busqueda.set(valor);
    if (valor.trim()) {
      if (!anterior) this.abiertosAntesDeBuscar = new Set(this.abiertos());
      const encontrados = new Set<string>();
      const texto = this.normalizar(valor);
      const visitar = (nodo: NodoJerarquia): boolean => {
        const hijosCoinciden = nodo.hijos.map(visitar).some(Boolean);
        const coincide = this.normalizar(nodo.usuario.nombre).includes(texto);
        if (coincide || hijosCoinciden) encontrados.add(nodo.usuario.uid);
        return coincide || hijosCoinciden;
      };
      this.arbolBase().forEach(visitar);
      this.abiertos.set(encontrados);
      this.cargarMovilizadoresAbiertos();
    } else {
      this.abiertos.set(this.abiertosAntesDeBuscar || new Set());
      this.abiertosAntesDeBuscar = null;
    }
  }

  contraerTodo(): void {
    this.busqueda.set('');
    this.abiertosAntesDeBuscar = null;
    this.abiertos.set(new Set());
  }

  descripcion(nodo: NodoJerarquia): string {
    if (nodo.usuario.rol === 'movilizador') {
      const total =
        this.listados()[nodo.usuario.uid]?.datos?.length ?? nodo.totalSimpatizantes ?? 0;
      return `${total} ${total === 1 ? 'simpatizante' : 'simpatizantes'}`;
    }
    const enlaces = nodo.hijos.filter((hijo) => hijo.usuario.rol === 'enlace').length;
    const movilizadores = nodo.hijos.filter((hijo) => hijo.usuario.rol === 'movilizador').length;
    if (nodo.usuario.rol === 'enlace')
      return `${movilizadores} ${movilizadores === 1 ? 'movilizador' : 'movilizadores'}`;
    return `${enlaces} ${enlaces === 1 ? 'enlace' : 'enlaces'}${movilizadores ? ` · ${movilizadores} sin enlace` : ''}`;
  }

  iniciales(nombre: string): string {
    return nombre
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((palabra) => palabra[0])
      .join('')
      .toUpperCase();
  }

  async cargarSimpatizantes(uid: string, reintentar = false): Promise<void> {
    const actual = this.listados()[uid];
    if (actual?.cargando || (!reintentar && actual)) return;
    const version = this.versionListados;
    this.listados.update((estados) => ({ ...estados, [uid]: { cargando: true } }));
    try {
      const datos = await this.votantesService.obtenerSimpatizantesDeMovilizador(uid);
      if (version === this.versionListados)
        this.listados.update((estados) => ({ ...estados, [uid]: { cargando: false, datos } }));
    } catch {
      if (version === this.versionListados)
        this.listados.update((estados) => ({
          ...estados,
          [uid]: {
            cargando: false,
            error: 'No se pudieron cargar los simpatizantes. Intenta de nuevo.',
          },
        }));
    }
  }

  private cargarMovilizadoresAbiertos(): void {
    const visitar = (nodos: NodoJerarquia[]) => {
      for (const nodo of nodos) {
        if (nodo.usuario.rol === 'movilizador' && this.abiertos().has(nodo.usuario.uid))
          void this.cargarSimpatizantes(nodo.usuario.uid);
        visitar(nodo.hijos);
      }
    };
    visitar(this.arbolBase());
  }

  private normalizar(texto: string): string {
    return texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  constructor() {
    this.servicio.cambios$
      .pipe(startWith(undefined), takeUntilDestroyed())
      .subscribe(() => this.cargar());
  }

  async cargar(): Promise<void> {
    const solicitud = ++this.solicitud;
    this.versionListados++;
    this.listados.set({});
    this.cargando.set(true);
    this.error.set('');
    try {
      const datos = await this.servicio.listar();
      if (solicitud !== this.solicitud) return;
      for (const cuenta of datos.cuentasSinPerfil || []) {
        this.formularios[cuenta.uid] ??= {
          nombre: cuenta.nombre || cuenta.correo.split('@')[0],
          enlaceUid: '',
        };
      }
      this.datos.set(datos);
      if (this.busqueda().trim()) this.cambiarBusqueda(this.busqueda());
      else this.cargarMovilizadoresAbiertos();
    } catch (error) {
      if (solicitud === this.solicitud)
        this.error.set(error instanceof Error ? error.message : 'No se pudo cargar la jerarquía.');
    } finally {
      if (solicitud === this.solicitud) this.cargando.set(false);
    }
  }

  async recuperar(uid: string): Promise<void> {
    if (this.recuperando()) return;
    const formulario = this.formularios[uid];
    if (!formulario.nombre.trim() || !formulario.enlaceUid) {
      this.error.set('Captura el nombre y selecciona el enlace responsable.');
      return;
    }
    this.recuperando.set(uid);
    this.error.set('');
    try {
      await this.servicio.asignarCuentaSinPerfil(
        uid,
        formulario.nombre.trim(),
        formulario.enlaceUid,
      );
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo vincular la cuenta.');
    } finally {
      this.recuperando.set('');
    }
  }
}
