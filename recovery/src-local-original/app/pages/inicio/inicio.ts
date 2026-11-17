import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  BehaviorSubject,
  combineLatest,
  map,
  shareReplay,
} from 'rxjs';

import { ColoniasService } from '../../core/services/colonias.service';
import { SeccionesElectoralesService } from '../../core/services/secciones-electorales.service';
import { UsuariosService } from '../../core/services/usuarios.service';
import { VotantesService } from '../../core/services/votantes.service';

import { UsuarioSistema } from '../../core/models/usuario-sistema.model';
import { Votante } from '../../core/models/votante.model';

type AgrupacionCapturas = 'dia' | 'semana' | 'mes';

interface FiltrosInicio {
  seccion: string;
  colonia: string;
  agrupacionCapturas: AgrupacionCapturas;
}

interface GraficaItem {
  nombre: string;
  total: number;
  porcentaje: number;
}

interface RendimientoSeccional {
  uid: string;
  nombre: string;
  totalDia: number;
  totalSemana: number;
  totalMes: number;
  totalGeneral: number;
  totalMovilizadores: number;
  promedioMesPorMovilizador: number;
  mejorMovilizadorMes: string;
}

interface InicioViewModel {
  totalSecciones: number;
  totalColonias: number;
  totalVotantesFiltrados: number;
  votantesPorSeccion: GraficaItem[];
  votantesPorColonia: GraficaItem[];
  edadPorRangos: GraficaItem[];
  capturasPorPeriodo: GraficaItem[];
  tituloCapturas: string;
  rendimientoSeccionales: RendimientoSeccional[];
}

@Component({
  selector: 'app-inicio',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './inicio.html',
  styleUrl: './inicio.css',
})
export class Inicio {
  private seccionesService = inject(SeccionesElectoralesService);
  private coloniasService = inject(ColoniasService);
  private votantesService = inject(VotantesService);
  private usuariosService = inject(UsuariosService);

  filtros: FiltrosInicio = {
    seccion: '',
    colonia: '',
    agrupacionCapturas: 'dia',
  };

  private filtrosSubject = new BehaviorSubject<FiltrosInicio>({
    ...this.filtros,
  });

  secciones$ = this.seccionesService.obtenerSecciones().pipe(
    shareReplay({
      bufferSize: 1,
      refCount: true,
    })
  );

  colonias$ = this.coloniasService.obtenerColonias().pipe(
    shareReplay({
      bufferSize: 1,
      refCount: true,
    })
  );

  votantes$ = this.votantesService.obtenerVotantes().pipe(
    shareReplay({
      bufferSize: 1,
      refCount: true,
    })
  );

  usuarios$ = this.usuariosService.obtenerUsuarios().pipe(
    shareReplay({
      bufferSize: 1,
      refCount: true,
    })
  );

  seccionesDisponibles$ = this.votantes$.pipe(
    map((votantes) => {
      const secciones = votantes
        .map((votante) => votante.seccion)
        .filter((seccion) => seccion && seccion > 0);

      return Array.from(new Set(secciones)).sort((a, b) => a - b);
    })
  );

  coloniasDisponibles$ = this.votantes$.pipe(
    map((votantes) => {
      const colonias = votantes
        .map((votante) => votante.colonia)
        .filter((colonia) => colonia && colonia.trim() !== '');

      return Array.from(new Set(colonias)).sort((a, b) =>
        a.localeCompare(b)
      );
    })
  );

  vm$ = combineLatest([
    this.secciones$,
    this.colonias$,
    this.votantes$,
    this.usuarios$,
    this.filtrosSubject,
  ]).pipe(
    map(([secciones, colonias, votantes, usuarios, filtros]) => {
      const votantesFiltrados = this.filtrarVotantes(votantes, filtros);

      return {
        totalSecciones: secciones.length,
        totalColonias: colonias.length,
        totalVotantesFiltrados: votantesFiltrados.length,

        votantesPorSeccion: this.agruparPorCampo(
          votantesFiltrados,
          'seccion',
          votantesFiltrados.length
        ),

        votantesPorColonia: this.agruparPorCampo(
          votantesFiltrados,
          'colonia',
          votantesFiltrados.length
        ),

        edadPorRangos: this.agruparPorEdad(
          votantesFiltrados,
          votantesFiltrados.length
        ),

        capturasPorPeriodo: this.agruparCapturasPorPeriodo(
          votantesFiltrados,
          filtros.agrupacionCapturas
        ),

        tituloCapturas:
          filtros.agrupacionCapturas === 'dia'
            ? 'Capturas por día'
            : filtros.agrupacionCapturas === 'semana'
              ? 'Capturas por semana'
              : 'Capturas por mes',

        rendimientoSeccionales: this.construirRendimientoSeccionales(
          usuarios,
          votantesFiltrados
        ),
      };
    }),
    shareReplay({
      bufferSize: 1,
      refCount: true,
    })
  );

  actualizarFiltros(): void {
    this.filtrosSubject.next({
      ...this.filtros,
    });
  }

  limpiarFiltros(): void {
    this.filtros = {
      seccion: '',
      colonia: '',
      agrupacionCapturas: 'dia',
    };

    this.actualizarFiltros();
  }

  filtrarVotantes(votantes: Votante[], filtros: FiltrosInicio): Votante[] {
    return votantes.filter((votante) => {
      const coincideSeccion =
        !filtros.seccion || votante.seccion.toString() === filtros.seccion;

      const coincideColonia =
        !filtros.colonia || votante.colonia === filtros.colonia;

      return coincideSeccion && coincideColonia;
    });
  }

  construirRendimientoSeccionales(
    usuarios: UsuarioSistema[],
    votantes: Votante[]
  ): RendimientoSeccional[] {
    const seccionales = usuarios
      .filter((usuario) => usuario.rol === 'seccional')
      .sort((a, b) => a.nombre.localeCompare(b.nombre));

    const movilizadores = usuarios.filter(
      (usuario) => usuario.rol === 'movilizador'
    );

    const hoy = new Date();

    return seccionales
      .map((seccional) => {
        const movilizadoresDelSeccional = movilizadores.filter(
          (movilizador) => movilizador.seccionalUid === seccional.uid
        );

        const capturadores = new Set<string>([
          seccional.uid,
          ...movilizadoresDelSeccional.map((movilizador) => movilizador.uid),
        ]);

        const votantesDelSeccional = votantes.filter((votante) =>
          capturadores.has(votante.capturadoPorUid || '')
        );

        const totalDia = votantesDelSeccional.filter((votante) => {
          const fecha = this.obtenerFechaVotante(votante);
          return fecha ? this.esMismoDia(fecha, hoy) : false;
        }).length;

        const totalSemana = votantesDelSeccional.filter((votante) => {
          const fecha = this.obtenerFechaVotante(votante);
          return fecha ? this.esMismaSemana(fecha, hoy) : false;
        }).length;

        const totalMes = votantesDelSeccional.filter((votante) => {
          const fecha = this.obtenerFechaVotante(votante);
          return fecha ? this.esMismoMes(fecha, hoy) : false;
        }).length;

        const mejorMovilizadorMes = this.obtenerMejorMovilizadorMes(
          movilizadoresDelSeccional,
          votantes,
          hoy
        );

        return {
          uid: seccional.uid,
          nombre: seccional.nombre,
          totalDia,
          totalSemana,
          totalMes,
          totalGeneral: votantesDelSeccional.length,
          totalMovilizadores: movilizadoresDelSeccional.length,
          promedioMesPorMovilizador:
            movilizadoresDelSeccional.length > 0
              ? Math.round(totalMes / movilizadoresDelSeccional.length)
              : 0,
          mejorMovilizadorMes,
        };
      })
      .sort((a, b) => {
        if (b.totalMes !== a.totalMes) {
          return b.totalMes - a.totalMes;
        }

        if (b.totalSemana !== a.totalSemana) {
          return b.totalSemana - a.totalSemana;
        }

        return b.totalDia - a.totalDia;
      });
  }

  obtenerMejorMovilizadorMes(
    movilizadores: UsuarioSistema[],
    votantes: Votante[],
    hoy: Date
  ): string {
    if (movilizadores.length === 0) {
      return 'Sin movilizadores';
    }

    const rendimiento = movilizadores.map((movilizador) => {
      const totalMes = votantes.filter((votante) => {
        if (votante.capturadoPorUid !== movilizador.uid) {
          return false;
        }

        const fecha = this.obtenerFechaVotante(votante);

        return fecha ? this.esMismoMes(fecha, hoy) : false;
      }).length;

      return {
        nombre: movilizador.nombre,
        totalMes,
      };
    });

    rendimiento.sort((a, b) => b.totalMes - a.totalMes);

    const mejor = rendimiento[0];

    if (!mejor || mejor.totalMes === 0) {
      return 'Sin capturas este mes';
    }

    return `${mejor.nombre} (${mejor.totalMes})`;
  }

  agruparPorCampo(
    votantes: Votante[],
    campo: 'seccion' | 'colonia',
    totalGeneral: number
  ): GraficaItem[] {
    const agrupados = new Map<string, number>();

    votantes.forEach((votante) => {
      const valor = String(votante[campo] || 'Sin dato');
      const totalActual = agrupados.get(valor) || 0;

      agrupados.set(valor, totalActual + 1);
    });

    return Array.from(agrupados.entries())
      .map(([nombre, total]) => ({
        nombre,
        total,
        porcentaje: this.obtenerPorcentaje(total, totalGeneral),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }

  agruparPorEdad(votantes: Votante[], totalGeneral: number): GraficaItem[] {
    const rangos = [
      { nombre: '18 a 29 años', min: 18, max: 29, total: 0 },
      { nombre: '30 a 39 años', min: 30, max: 39, total: 0 },
      { nombre: '40 a 49 años', min: 40, max: 49, total: 0 },
      { nombre: '50 a 59 años', min: 50, max: 59, total: 0 },
      { nombre: '60 años o más', min: 60, max: 200, total: 0 },
    ];

    votantes.forEach((votante) => {
      const edad = Number(votante.edad);

      const rango = rangos.find(
        (item) => edad >= item.min && edad <= item.max
      );

      if (rango) {
        rango.total++;
      }
    });

    return rangos.map((rango) => ({
      nombre: rango.nombre,
      total: rango.total,
      porcentaje: this.obtenerPorcentaje(rango.total, totalGeneral),
    }));
  }

  agruparCapturasPorPeriodo(
    votantes: Votante[],
    agrupacion: AgrupacionCapturas
  ): GraficaItem[] {
    const agrupados = new Map<
      string,
      {
        nombre: string;
        total: number;
        orden: number;
      }
    >();

    votantes.forEach((votante) => {
      const fecha = this.obtenerFechaVotante(votante);

      if (!fecha) {
        return;
      }

      const periodo =
        agrupacion === 'dia'
          ? this.obtenerPeriodoDia(fecha)
          : agrupacion === 'semana'
            ? this.obtenerPeriodoSemana(fecha)
            : this.obtenerPeriodoMes(fecha);

      const actual = agrupados.get(periodo.clave) || {
        nombre: periodo.nombre,
        total: 0,
        orden: periodo.orden,
      };

      actual.total++;
      agrupados.set(periodo.clave, actual);
    });

    const lista = Array.from(agrupados.values()).sort(
      (a, b) => a.orden - b.orden
    );

    const limite =
      agrupacion === 'dia'
        ? 14
        : agrupacion === 'semana'
          ? 12
          : 12;

    const ultimos = lista.slice(-limite);
    const maximo = Math.max(...ultimos.map((item) => item.total), 0);

    return ultimos.map((item) => ({
      nombre: item.nombre,
      total: item.total,
      porcentaje:
        maximo > 0 ? Math.max(Math.round((item.total / maximo) * 100), 4) : 0,
    }));
  }

  obtenerFechaVotante(votante: Votante): Date | null {
    if (votante.fechaRegistro instanceof Date) {
      return votante.fechaRegistro;
    }

    if (votante.fechaRegistroLocal) {
      const fechaLocal = new Date(votante.fechaRegistroLocal);

      if (!isNaN(fechaLocal.getTime())) {
        return fechaLocal;
      }
    }

    return null;
  }

  obtenerPeriodoDia(fecha: Date): {
    clave: string;
    nombre: string;
    orden: number;
  } {
    const fechaBase = new Date(
      fecha.getFullYear(),
      fecha.getMonth(),
      fecha.getDate()
    );

    return {
      clave: `${fechaBase.getFullYear()}-${String(
        fechaBase.getMonth() + 1
      ).padStart(2, '0')}-${String(fechaBase.getDate()).padStart(2, '0')}`,
      nombre: this.formatearFechaCorta(fechaBase),
      orden: fechaBase.getTime(),
    };
  }

  obtenerPeriodoSemana(fecha: Date): {
    clave: string;
    nombre: string;
    orden: number;
  } {
    const fechaBase = new Date(
      fecha.getFullYear(),
      fecha.getMonth(),
      fecha.getDate()
    );

    const diaSemana = fechaBase.getDay();
    const diferencia = diaSemana === 0 ? -6 : 1 - diaSemana;

    fechaBase.setDate(fechaBase.getDate() + diferencia);

    return {
      clave: `${fechaBase.getFullYear()}-${String(
        fechaBase.getMonth() + 1
      ).padStart(2, '0')}-${String(fechaBase.getDate()).padStart(2, '0')}`,
      nombre: `Semana ${this.formatearFechaCorta(fechaBase)}`,
      orden: fechaBase.getTime(),
    };
  }

  obtenerPeriodoMes(fecha: Date): {
    clave: string;
    nombre: string;
    orden: number;
  } {
    const fechaBase = new Date(fecha.getFullYear(), fecha.getMonth(), 1);

    return {
      clave: `${fechaBase.getFullYear()}-${String(
        fechaBase.getMonth() + 1
      ).padStart(2, '0')}`,
      nombre: new Intl.DateTimeFormat('es-MX', {
        month: 'short',
        year: 'numeric',
      }).format(fechaBase),
      orden: fechaBase.getTime(),
    };
  }

  esMismoDia(fecha: Date, referencia: Date): boolean {
    return (
      fecha.getFullYear() === referencia.getFullYear() &&
      fecha.getMonth() === referencia.getMonth() &&
      fecha.getDate() === referencia.getDate()
    );
  }

  esMismaSemana(fecha: Date, referencia: Date): boolean {
    return (
      this.obtenerInicioSemana(fecha).getTime() ===
      this.obtenerInicioSemana(referencia).getTime()
    );
  }

  esMismoMes(fecha: Date, referencia: Date): boolean {
    return (
      fecha.getFullYear() === referencia.getFullYear() &&
      fecha.getMonth() === referencia.getMonth()
    );
  }

  obtenerInicioSemana(fecha: Date): Date {
    const fechaBase = new Date(
      fecha.getFullYear(),
      fecha.getMonth(),
      fecha.getDate()
    );

    const diaSemana = fechaBase.getDay();
    const diferencia = diaSemana === 0 ? -6 : 1 - diaSemana;

    fechaBase.setDate(fechaBase.getDate() + diferencia);

    return fechaBase;
  }

  formatearFechaCorta(fecha: Date): string {
    return new Intl.DateTimeFormat('es-MX', {
      day: '2-digit',
      month: '2-digit',
    }).format(fecha);
  }

  obtenerPorcentaje(total: number, general: number): number {
    if (general === 0) {
      return 0;
    }

    return Math.round((total / general) * 100);
  }
}