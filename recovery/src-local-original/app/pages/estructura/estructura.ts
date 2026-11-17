import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { combineLatest, firstValueFrom, map, shareReplay } from 'rxjs';
import * as XLSX from 'xlsx';

import { Colonia } from '../../core/models/colonia.model';
import { SeccionElectoral } from '../../core/models/seccion-electoral.model';
import {
  RolUsuario,
  UsuarioSistema,
} from '../../core/models/usuario-sistema.model';
import { Votante } from '../../core/models/votante.model';

import { ColoniasService } from '../../core/services/colonias.service';
import { SeccionesElectoralesService } from '../../core/services/secciones-electorales.service';
import { UsuariosService } from '../../core/services/usuarios.service';
import { VotantesService } from '../../core/services/votantes.service';

type TabEstructura = 'secciones' | 'colonias' | 'usuarios' | 'jerarquia';

interface MovilizadorJerarquia {
  usuario: UsuarioSistema;
  votantes: Votante[];
  totalVotantes: number;
  porcentajeDentroSeccional: number;
}

interface SeccionalJerarquia {
  usuario: UsuarioSistema;
  movilizadores: MovilizadorJerarquia[];
  votantesDirectos: Votante[];
  totalVotantes: number;
  totalMovilizadores: number;
  promedioPorMovilizador: number;
}

interface CoordinadorJerarquia {
  usuario: UsuarioSistema;
  seccionales: SeccionalJerarquia[];
  totalSeccionales: number;
  totalMovilizadores: number;
  totalVotantes: number;
}

interface FormularioMovilizadorMonitoreo {
  uid: string;
  nombre: string;
  correo: string;
  seccionalUid: string;
}

interface FormularioAsignacionMovilizadorMonitoreo {
  movilizadorUid: string;
  seccionalUid: string;
}

interface FormularioAsignacionVotanteMonitoreo {
  votanteId: string;
  movilizadorUid: string;
}

interface VotanteConAsignacion extends Votante {
  movilizadorUid?: string;
  movilizadorNombre?: string;
  seccionalUid?: string;
  seccionalNombre?: string;
  asignadoPorUid?: string;
  asignadoPorNombre?: string;
}

@Component({
  selector: 'app-estructura',
  imports: [CommonModule, FormsModule],
  templateUrl: './estructura.html',
  styleUrl: './estructura.css',
})
export class Estructura {
  private seccionesService = inject(SeccionesElectoralesService);
  private coloniasService = inject(ColoniasService);
  private usuariosService = inject(UsuariosService);
  private votantesService = inject(VotantesService);
  private cd = inject(ChangeDetectorRef);

  rolUsuarioActual = (localStorage.getItem('rolUsuario') || '') as RolUsuario;
  uidUsuarioActual =
    localStorage.getItem('uidUsuario') ||
    localStorage.getItem('usuarioUid') ||
    localStorage.getItem('uid') ||
    '';
  nombreUsuarioActual =
    localStorage.getItem('nombreUsuario') ||
    localStorage.getItem('usuarioNombre') ||
    '';

  esCoordinador = this.rolUsuarioActual === 'coordinador';
  esSeccional = this.rolUsuarioActual === 'seccional';

  tabActivo: TabEstructura = this.esSeccional ? 'jerarquia' : 'secciones';

  panelesAbiertos: Record<TabEstructura, boolean> = {
    secciones: false,
    colonias: false,
    usuarios: false,
    jerarquia: this.esSeccional,
  };

  mensajeExito = '';
  mensajeError = '';

  importandoSecciones = false;
  importandoColonias = false;

  editandoColoniaId = '';
  editandoUsuarioId = '';

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

  usuarios$ = this.usuariosService.obtenerUsuarios().pipe(
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

  coordinadores$ = this.usuarios$.pipe(
    map((usuarios) =>
      usuarios
        .filter((usuario) => usuario.rol === 'coordinador')
        .sort((a, b) => a.nombre.localeCompare(b.nombre))
    )
  );

  seccionales$ = this.usuarios$.pipe(
    map((usuarios) =>
      usuarios
        .filter((usuario) => usuario.rol === 'seccional')
        .sort((a, b) => a.nombre.localeCompare(b.nombre))
    )
  );

  jerarquia$ = combineLatest([this.usuarios$, this.votantes$]).pipe(
    map(([usuarios, votantes]) => {
      const jerarquia = this.construirJerarquia(usuarios, votantes);

      if (!this.esSeccional) {
        return jerarquia;
      }

      return jerarquia
        .map((coordinador) => {
          const seccionalesPropios = coordinador.seccionales.filter(
            (seccional) => seccional.usuario.uid === this.uidUsuarioActual
          );

          const totalMovilizadores = seccionalesPropios.reduce(
            (total, seccional) => total + seccional.totalMovilizadores,
            0
          );

          const totalVotantes = seccionalesPropios.reduce(
            (total, seccional) => total + seccional.totalVotantes,
            0
          );

          return {
            ...coordinador,
            seccionales: seccionalesPropios,
            totalSeccionales: seccionalesPropios.length,
            totalMovilizadores,
            totalVotantes,
          };
        })
        .filter((coordinador) => coordinador.seccionales.length > 0);
    })
  );

  formSeccion: SeccionElectoral = {
    seccion: 0,
    municipio: 'San Juan Bautista Tuxtepec',
    colonia: '',
    activo: true,
  };

  formColonia: Omit<Colonia, 'id'> = {
    nombre: '',
    municipio: 'San Juan Bautista Tuxtepec',
    activo: true,
  };

  formUsuario: UsuarioSistema = {
    uid: '',
    nombre: '',
    correo: '',
    rol: 'movilizador',
    activo: true,
    coordinadorUid: '',
    coordinadorNombre: '',
    seccionalUid: '',
    seccionalNombre: '',
  };

  formMovilizadorMonitoreo: FormularioMovilizadorMonitoreo = {
    uid: '',
    nombre: '',
    correo: '',
    seccionalUid: this.esSeccional ? this.uidUsuarioActual : '',
  };

  formAsignacionMovilizadorMonitoreo: FormularioAsignacionMovilizadorMonitoreo = {
    movilizadorUid: '',
    seccionalUid: '',
  };

  formAsignacionVotanteMonitoreo: FormularioAsignacionVotanteMonitoreo = {
    votanteId: '',
    movilizadorUid: '',
  };

  busquedaSeccionalNuevoMovilizadorMonitoreo = '';
  busquedaMovilizadorAsignacionMonitoreo = '';
  busquedaSeccionalAsignacionMonitoreo = '';
  busquedaVotanteAsignacionMonitoreo = '';
  busquedaMovilizadorVotanteMonitoreo = '';

  puedeVerPanel(panel: TabEstructura): boolean {
    if (this.esCoordinador) {
      return true;
    }

    if (this.esSeccional) {
      return panel === 'jerarquia';
    }

    return false;
  }

  cambiarTab(tab: TabEstructura): void {
    if (!this.puedeVerPanel(tab)) {
      return;
    }

    this.tabActivo = tab;
    this.panelesAbiertos[tab] = true;
    this.limpiarMensajes();
  }

  alternarPanel(panel: TabEstructura): void {
    if (!this.puedeVerPanel(panel)) {
      return;
    }

    this.tabActivo = panel;
    this.panelesAbiertos[panel] = !this.panelesAbiertos[panel];
    this.limpiarMensajes();
  }

  estaPanelAbierto(panel: TabEstructura): boolean {
    return this.panelesAbiertos[panel];
  }

  abrirPanel(panel: TabEstructura): void {
    if (!this.puedeVerPanel(panel)) {
      return;
    }

    this.tabActivo = panel;
    this.panelesAbiertos[panel] = true;
  }

  async guardarSeccion(): Promise<void> {
    this.limpiarMensajes();

    if (!this.formSeccion.seccion || Number(this.formSeccion.seccion) <= 0) {
      this.mensajeError = 'Captura un número de sección válido.';
      this.cd.detectChanges();
      return;
    }

    if (!this.formSeccion.municipio.trim()) {
      this.mensajeError = 'El municipio es obligatorio.';
      this.cd.detectChanges();
      return;
    }

    try {
      await this.seccionesService.guardarSeccion({
        ...this.formSeccion,
        seccion: Number(this.formSeccion.seccion),
        municipio: this.formSeccion.municipio.trim(),
        colonia: this.formSeccion.colonia?.trim() || '',
        activo: true,
      });

      this.mensajeExito = 'Sección guardada correctamente.';
      this.limpiarFormularioSeccion();
      this.abrirPanel('secciones');
    } catch (error) {
      console.error('Error al guardar sección:', error);
      this.mensajeError = 'No se pudo guardar la sección.';
    } finally {
      this.cd.detectChanges();
    }
  }

  editarSeccion(seccion: SeccionElectoral): void {
    this.formSeccion = {
      id: seccion.id,
      seccion: seccion.seccion,
      municipio: seccion.municipio,
      colonia: seccion.colonia || '',
      activo: seccion.activo,
    };

    this.abrirPanel('secciones');
    this.limpiarMensajes();
  }

  async cambiarEstadoSeccion(seccion: SeccionElectoral): Promise<void> {
    this.limpiarMensajes();

    if (!seccion.id) {
      return;
    }

    try {
      await this.seccionesService.cambiarEstadoSeccion(
        seccion.id,
        !seccion.activo
      );

      this.mensajeExito = seccion.activo
        ? 'Sección desactivada correctamente.'
        : 'Sección activada correctamente.';

      this.abrirPanel('secciones');
    } catch (error) {
      console.error('Error al cambiar estado de sección:', error);
      this.mensajeError = 'No se pudo cambiar el estado de la sección.';
    } finally {
      this.cd.detectChanges();
    }
  }

  limpiarFormularioSeccion(): void {
    this.formSeccion = {
      seccion: 0,
      municipio: 'San Juan Bautista Tuxtepec',
      colonia: '',
      activo: true,
    };
  }

  async guardarColonia(): Promise<void> {
    this.limpiarMensajes();

    if (!this.formColonia.nombre.trim()) {
      this.mensajeError = 'El nombre de la colonia es obligatorio.';
      this.cd.detectChanges();
      return;
    }

    if (!this.formColonia.municipio.trim()) {
      this.mensajeError = 'El municipio es obligatorio.';
      this.cd.detectChanges();
      return;
    }

    try {
      if (this.editandoColoniaId) {
        await this.coloniasService.actualizarColonia(this.editandoColoniaId, {
          ...this.formColonia,
          nombre: this.formColonia.nombre.trim(),
          municipio: this.formColonia.municipio.trim(),
          activo: true,
        });

        this.mensajeExito = 'Colonia actualizada correctamente.';
      } else {
        await this.coloniasService.crearColonia({
          ...this.formColonia,
          nombre: this.formColonia.nombre.trim(),
          municipio: this.formColonia.municipio.trim(),
          activo: true,
        });

        this.mensajeExito = 'Colonia guardada correctamente.';
      }

      this.limpiarFormularioColonia();
      this.abrirPanel('colonias');
    } catch (error) {
      console.error('Error al guardar colonia:', error);
      this.mensajeError = 'No se pudo guardar la colonia.';
    } finally {
      this.cd.detectChanges();
    }
  }

  editarColonia(colonia: Colonia): void {
    if (!colonia.id) {
      return;
    }

    this.editandoColoniaId = colonia.id;

    this.formColonia = {
      nombre: colonia.nombre,
      municipio: colonia.municipio,
      activo: colonia.activo,
    };

    this.abrirPanel('colonias');
    this.limpiarMensajes();
  }

  async cambiarEstadoColonia(colonia: Colonia): Promise<void> {
    this.limpiarMensajes();

    if (!colonia.id) {
      return;
    }

    try {
      await this.coloniasService.cambiarEstadoColonia(
        colonia.id,
        !colonia.activo
      );

      this.mensajeExito = colonia.activo
        ? 'Colonia desactivada correctamente.'
        : 'Colonia activada correctamente.';

      this.abrirPanel('colonias');
    } catch (error) {
      console.error('Error al cambiar estado de colonia:', error);
      this.mensajeError = 'No se pudo cambiar el estado de la colonia.';
    } finally {
      this.cd.detectChanges();
    }
  }

  limpiarFormularioColonia(): void {
    this.editandoColoniaId = '';

    this.formColonia = {
      nombre: '',
      municipio: 'San Juan Bautista Tuxtepec',
      activo: true,
    };
  }

  async guardarUsuario(): Promise<void> {
    this.limpiarMensajes();

    if (!this.formUsuario.uid.trim()) {
      this.mensajeError = 'Captura el UID del usuario.';
      this.cd.detectChanges();
      return;
    }

    if (!this.formUsuario.nombre.trim()) {
      this.mensajeError = 'El nombre del usuario es obligatorio.';
      this.cd.detectChanges();
      return;
    }

    if (!this.formUsuario.correo.trim()) {
      this.mensajeError = 'El correo del usuario es obligatorio.';
      this.cd.detectChanges();
      return;
    }

    if (!this.formUsuario.rol) {
      this.mensajeError = 'Selecciona un rol.';
      this.cd.detectChanges();
      return;
    }

    if (
      this.formUsuario.rol === 'seccional' &&
      !this.formUsuario.coordinadorUid
    ) {
      this.mensajeError = 'Selecciona el coordinador responsable.';
      this.cd.detectChanges();
      return;
    }

    if (
      this.formUsuario.rol === 'movilizador' &&
      !this.formUsuario.seccionalUid
    ) {
      this.mensajeError = 'Selecciona el seccional responsable.';
      this.cd.detectChanges();
      return;
    }

    try {
      const usuarios = await firstValueFrom(this.usuarios$);

      const coordinador = usuarios.find(
        (usuario) => usuario.uid === this.formUsuario.coordinadorUid
      );

      const seccional = usuarios.find(
        (usuario) => usuario.uid === this.formUsuario.seccionalUid
      );

      await this.usuariosService.guardarUsuario({
        uid: this.formUsuario.uid.trim(),
        nombre: this.formUsuario.nombre.trim(),
        correo: this.formUsuario.correo.trim(),
        rol: this.formUsuario.rol as RolUsuario,
        activo: this.formUsuario.activo ?? true,

        coordinadorUid:
          this.formUsuario.rol === 'seccional'
            ? this.formUsuario.coordinadorUid || ''
            : '',

        coordinadorNombre:
          this.formUsuario.rol === 'seccional'
            ? coordinador?.nombre || ''
            : '',

        seccionalUid:
          this.formUsuario.rol === 'movilizador'
            ? this.formUsuario.seccionalUid || ''
            : '',

        seccionalNombre:
          this.formUsuario.rol === 'movilizador'
            ? seccional?.nombre || ''
            : '',
      });

      this.mensajeExito = this.editandoUsuarioId
        ? 'Usuario actualizado correctamente.'
        : 'Perfil de usuario guardado correctamente.';

      this.limpiarFormularioUsuario();
      this.abrirPanel('usuarios');
    } catch (error) {
      console.error('Error al guardar usuario:', error);
      this.mensajeError = 'No se pudo guardar el usuario.';
    } finally {
      this.cd.detectChanges();
    }
  }

  editarUsuario(usuario: UsuarioSistema): void {
    this.editandoUsuarioId = usuario.uid;

    this.formUsuario = {
      uid: usuario.uid,
      nombre: usuario.nombre,
      correo: usuario.correo,
      rol: usuario.rol,
      activo: usuario.activo,
      coordinadorUid: usuario.coordinadorUid || '',
      coordinadorNombre: usuario.coordinadorNombre || '',
      seccionalUid: usuario.seccionalUid || '',
      seccionalNombre: usuario.seccionalNombre || '',
    };

    this.abrirPanel('usuarios');
    this.limpiarMensajes();
  }

  async cambiarEstadoUsuario(usuario: UsuarioSistema): Promise<void> {
    this.limpiarMensajes();

    if (usuario.rol === 'coordinador') {
      this.mensajeError = 'No se puede desactivar un usuario coordinador.';
      this.cd.detectChanges();
      return;
    }

    try {
      await this.usuariosService.cambiarEstadoUsuario(
        usuario.uid,
        !usuario.activo
      );

      this.mensajeExito = usuario.activo
        ? 'Usuario desactivado correctamente.'
        : 'Usuario activado correctamente.';

      this.abrirPanel('usuarios');
    } catch (error) {
      console.error('Error al cambiar estado del usuario:', error);
      this.mensajeError = 'No se pudo cambiar el estado del usuario.';
    } finally {
      this.cd.detectChanges();
    }
  }

  limpiarFormularioUsuario(): void {
    this.editandoUsuarioId = '';

    this.formUsuario = {
      uid: '',
      nombre: '',
      correo: '',
      rol: 'movilizador',
      activo: true,
      coordinadorUid: '',
      coordinadorNombre: '',
      seccionalUid: '',
      seccionalNombre: '',
    };
  }


  obtenerSeccionalesMonitoreo(usuarios: UsuarioSistema[]): UsuarioSistema[] {
    if (this.esSeccional) {
      return usuarios.filter((usuario) => usuario.uid === this.uidUsuarioActual);
    }

    return usuarios
      .filter((usuario) => usuario.rol === 'seccional' && usuario.activo)
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }

  obtenerMovilizadoresMonitoreo(usuarios: UsuarioSistema[]): UsuarioSistema[] {
    const movilizadores = usuarios.filter(
      (usuario) => usuario.rol === 'movilizador' && usuario.activo
    );

    const filtrados = this.esSeccional
      ? movilizadores.filter(
          (movilizador) => movilizador.seccionalUid === this.uidUsuarioActual
        )
      : movilizadores;

    return filtrados.sort((a, b) => a.nombre.localeCompare(b.nombre));
  }

  obtenerSeccionalesMonitoreoFiltrados(
    usuarios: UsuarioSistema[],
    busqueda: string
  ): UsuarioSistema[] {
    return this.obtenerSeccionalesMonitoreo(usuarios).filter((seccional) =>
      this.coincideUsuarioConBusqueda(seccional, busqueda)
    );
  }

  obtenerMovilizadoresMonitoreoFiltrados(
    usuarios: UsuarioSistema[],
    busqueda: string
  ): UsuarioSistema[] {
    return this.obtenerMovilizadoresMonitoreo(usuarios).filter((movilizador) =>
      this.coincideUsuarioConBusqueda(movilizador, busqueda)
    );
  }

  obtenerVotantesAsignablesMonitoreo(votantes: Votante[]): VotanteConAsignacion[] {
    if (!this.esCoordinador) {
      return [];
    }

    return (votantes as VotanteConAsignacion[])
      .filter((votante) => votante.activo)
      .sort((a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto));
  }

  obtenerVotantesAsignablesMonitoreoFiltrados(
    votantes: Votante[],
    busqueda: string
  ): VotanteConAsignacion[] {
    const textoBusqueda = this.normalizarTextoBusqueda(busqueda);

    if (!textoBusqueda) {
      return this.obtenerVotantesAsignablesMonitoreo(votantes);
    }

    return this.obtenerVotantesAsignablesMonitoreo(votantes).filter((votante) => {
      const textoVotante = this.normalizarTextoBusqueda(
        `${votante.nombreCompleto || ''} ${votante.telefono || ''} ${
          votante.claveElector || ''
        } ${votante.seccion || ''} ${votante.colonia || ''} ${
          votante.municipio || ''
        } ${(votante as VotanteConAsignacion).movilizadorNombre || ''} ${
          (votante as VotanteConAsignacion).seccionalNombre || ''
        }`
      );

      return textoVotante.includes(textoBusqueda);
    });
  }

  private coincideUsuarioConBusqueda(
    usuario: UsuarioSistema,
    busqueda: string
  ): boolean {
    const textoBusqueda = this.normalizarTextoBusqueda(busqueda);

    if (!textoBusqueda) {
      return true;
    }

    const textoUsuario = this.normalizarTextoBusqueda(
      `${usuario.nombre || ''} ${usuario.correo || ''} ${usuario.uid || ''} ${
        usuario.rol || ''
      } ${usuario.coordinadorNombre || ''} ${usuario.seccionalNombre || ''}`
    );

    return textoUsuario.includes(textoBusqueda);
  }

  private normalizarTextoBusqueda(valor: string): string {
    return String(valor || '')
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async guardarMovilizadorDesdeMonitoreo(): Promise<void> {
    this.limpiarMensajes();

    if (!this.esCoordinador && !this.esSeccional) {
      this.mensajeError = 'No tienes permiso para agregar movilizadores.';
      this.cd.detectChanges();
      return;
    }

    if (this.esSeccional) {
      this.formMovilizadorMonitoreo.seccionalUid = this.uidUsuarioActual;
    }

    if (!this.formMovilizadorMonitoreo.uid.trim()) {
      this.mensajeError = 'Captura el UID del movilizador.';
      this.cd.detectChanges();
      return;
    }

    if (!this.formMovilizadorMonitoreo.nombre.trim()) {
      this.mensajeError = 'Captura el nombre del movilizador.';
      this.cd.detectChanges();
      return;
    }

    if (!this.formMovilizadorMonitoreo.correo.trim()) {
      this.mensajeError = 'Captura el correo del movilizador.';
      this.cd.detectChanges();
      return;
    }

    if (!this.formMovilizadorMonitoreo.seccionalUid) {
      this.mensajeError = 'Selecciona el seccional responsable del movilizador.';
      this.cd.detectChanges();
      return;
    }

    try {
      const usuarios = await firstValueFrom(this.usuarios$);
      const seccional = this.esSeccional
        ? {
            uid: this.uidUsuarioActual,
            nombre: this.nombreUsuarioActual,
          }
        : usuarios.find(
            (usuario) =>
              usuario.uid === this.formMovilizadorMonitoreo.seccionalUid &&
              usuario.rol === 'seccional'
          );

      if (!seccional) {
        this.mensajeError = 'No se encontró el seccional seleccionado.';
        this.cd.detectChanges();
        return;
      }

      await this.usuariosService.guardarUsuario({
        uid: this.formMovilizadorMonitoreo.uid.trim(),
        nombre: this.formMovilizadorMonitoreo.nombre.trim(),
        correo: this.formMovilizadorMonitoreo.correo.trim(),
        rol: 'movilizador',
        activo: true,
        coordinadorUid: '',
        coordinadorNombre: '',
        seccionalUid: seccional.uid,
        seccionalNombre: seccional.nombre,
      });

      this.mensajeExito = 'Movilizador agregado correctamente desde monitoreo.';
      this.limpiarFormularioMovilizadorMonitoreo();
      this.abrirPanel('jerarquia');
    } catch (error) {
      console.error('Error al guardar movilizador desde monitoreo:', error);
      this.mensajeError = 'No se pudo guardar el movilizador.';
    } finally {
      this.cd.detectChanges();
    }
  }

  async asignarMovilizadorASeccionalDesdeMonitoreo(): Promise<void> {
    this.limpiarMensajes();

    if (!this.esCoordinador) {
      this.mensajeError = 'Solo el coordinador puede reasignar movilizadores entre seccionales.';
      this.cd.detectChanges();
      return;
    }

    if (!this.formAsignacionMovilizadorMonitoreo.movilizadorUid) {
      this.mensajeError = 'Selecciona el movilizador que quieres asignar.';
      this.cd.detectChanges();
      return;
    }

    if (!this.formAsignacionMovilizadorMonitoreo.seccionalUid) {
      this.mensajeError = 'Selecciona el seccional responsable.';
      this.cd.detectChanges();
      return;
    }

    try {
      const usuarios = await firstValueFrom(this.usuarios$);
      const movilizador = usuarios.find(
        (usuario) =>
          usuario.uid === this.formAsignacionMovilizadorMonitoreo.movilizadorUid &&
          usuario.rol === 'movilizador'
      );
      const seccional = usuarios.find(
        (usuario) =>
          usuario.uid === this.formAsignacionMovilizadorMonitoreo.seccionalUid &&
          usuario.rol === 'seccional'
      );

      if (!movilizador) {
        this.mensajeError = 'No se encontró el movilizador seleccionado.';
        this.cd.detectChanges();
        return;
      }

      if (!seccional) {
        this.mensajeError = 'No se encontró el seccional seleccionado.';
        this.cd.detectChanges();
        return;
      }

      await this.usuariosService.guardarUsuario({
        ...movilizador,
        seccionalUid: seccional.uid,
        seccionalNombre: seccional.nombre,
      });

      this.mensajeExito = 'Movilizador asignado correctamente al seccional.';
      this.limpiarFormularioAsignacionMovilizadorMonitoreo();
      this.abrirPanel('jerarquia');
    } catch (error) {
      console.error('Error al asignar movilizador desde monitoreo:', error);
      this.mensajeError = 'No se pudo asignar el movilizador al seccional.';
    } finally {
      this.cd.detectChanges();
    }
  }

  async asignarVotanteAMovilizadorDesdeMonitoreo(): Promise<void> {
    this.limpiarMensajes();

    if (!this.esCoordinador) {
      this.mensajeError = 'Solo el coordinador puede asignar votantes a movilizadores desde monitoreo.';
      this.cd.detectChanges();
      return;
    }

    if (!this.formAsignacionVotanteMonitoreo.votanteId) {
      this.mensajeError = 'Selecciona el votante que quieres asignar.';
      this.cd.detectChanges();
      return;
    }

    if (!this.formAsignacionVotanteMonitoreo.movilizadorUid) {
      this.mensajeError = 'Selecciona el movilizador responsable.';
      this.cd.detectChanges();
      return;
    }

    try {
      const usuarios = await firstValueFrom(this.usuarios$);
      const movilizador = usuarios.find(
        (usuario) =>
          usuario.uid === this.formAsignacionVotanteMonitoreo.movilizadorUid &&
          usuario.rol === 'movilizador'
      );

      if (!movilizador) {
        this.mensajeError = 'No se encontró el movilizador seleccionado.';
        this.cd.detectChanges();
        return;
      }

      if (
        this.esSeccional &&
        movilizador.seccionalUid !== this.uidUsuarioActual
      ) {
        this.mensajeError =
          'Solo puedes asignar votantes a movilizadores de tu seccional.';
        this.cd.detectChanges();
        return;
      }

      const seccional = usuarios.find(
        (usuario) => usuario.uid === movilizador.seccionalUid
      );

      await this.votantesService.actualizarVotante(
        this.formAsignacionVotanteMonitoreo.votanteId,
        {
          movilizadorUid: movilizador.uid,
          movilizadorNombre: movilizador.nombre,
          seccionalUid: movilizador.seccionalUid || '',
          seccionalNombre:
            movilizador.seccionalNombre || seccional?.nombre || '',
          asignadoPorUid: this.uidUsuarioActual,
          asignadoPorNombre: this.nombreUsuarioActual,
        }
      );

      this.mensajeExito = 'Votante agregado correctamente al movilizador.';
      this.limpiarFormularioAsignacionVotanteMonitoreo();
      this.abrirPanel('jerarquia');
    } catch (error) {
      console.error('Error al asignar votante desde monitoreo:', error);
      this.mensajeError = 'No se pudo agregar el votante al movilizador.';
    } finally {
      this.cd.detectChanges();
    }
  }

  limpiarFormularioMovilizadorMonitoreo(): void {
    this.formMovilizadorMonitoreo = {
      uid: '',
      nombre: '',
      correo: '',
      seccionalUid: this.esSeccional ? this.uidUsuarioActual : '',
    };

    this.busquedaSeccionalNuevoMovilizadorMonitoreo = '';
  }

  limpiarFormularioAsignacionMovilizadorMonitoreo(): void {
    this.formAsignacionMovilizadorMonitoreo = {
      movilizadorUid: '',
      seccionalUid: '',
    };

    this.busquedaMovilizadorAsignacionMonitoreo = '';
    this.busquedaSeccionalAsignacionMonitoreo = '';
  }

  limpiarFormularioAsignacionVotanteMonitoreo(): void {
    this.formAsignacionVotanteMonitoreo = {
      votanteId: '',
      movilizadorUid: '',
    };

    this.busquedaVotanteAsignacionMonitoreo = '';
    this.busquedaMovilizadorVotanteMonitoreo = '';
  }

  construirJerarquia(
    usuarios: UsuarioSistema[],
    votantes: Votante[]
  ): CoordinadorJerarquia[] {
    const coordinadores = usuarios.filter(
      (usuario) => usuario.rol === 'coordinador'
    );

    const seccionales = usuarios.filter(
      (usuario) => usuario.rol === 'seccional'
    );

    const movilizadores = usuarios.filter(
      (usuario) => usuario.rol === 'movilizador'
    );

    return coordinadores.map((coordinador) => {
      const seccionalesDelCoordinador = seccionales.filter(
        (seccional) => seccional.coordinadorUid === coordinador.uid
      );

      const seccionalesConstruidos: SeccionalJerarquia[] =
        seccionalesDelCoordinador.map((seccional) => {
          const movilizadoresDelSeccional = movilizadores.filter(
            (movilizador) => movilizador.seccionalUid === seccional.uid
          );

          const movilizadoresBase = movilizadoresDelSeccional.map(
            (movilizador) => {
              const votantesDelMovilizador = votantes.filter((votante) => {
                const votanteAsignado = votante as VotanteConAsignacion;

                return (
                  votanteAsignado.movilizadorUid === movilizador.uid ||
                  (!votanteAsignado.movilizadorUid &&
                    votante.capturadoPorUid === movilizador.uid)
                );
              });

              return {
                usuario: movilizador,
                votantes: votantesDelMovilizador,
                totalVotantes: votantesDelMovilizador.length,
                porcentajeDentroSeccional: 0,
              };
            }
          );

          const votantesDirectos = votantes.filter((votante) => {
            const votanteAsignado = votante as VotanteConAsignacion;

            return (
              !votanteAsignado.movilizadorUid &&
              (votanteAsignado.seccionalUid === seccional.uid ||
                votante.capturadoPorUid === seccional.uid)
            );
          });

          const totalVotantesMovilizadores = movilizadoresBase.reduce(
            (total, movilizador) => total + movilizador.totalVotantes,
            0
          );

          const totalVotantes =
            totalVotantesMovilizadores + votantesDirectos.length;

          const movilizadoresConPorcentaje = movilizadoresBase
            .map((movilizador) => ({
              ...movilizador,
              porcentajeDentroSeccional:
                totalVotantes > 0
                  ? Math.round(
                      (movilizador.totalVotantes / totalVotantes) * 100
                    )
                  : 0,
            }))
            .sort((a, b) => b.totalVotantes - a.totalVotantes);

          return {
            usuario: seccional,
            movilizadores: movilizadoresConPorcentaje,
            votantesDirectos,
            totalVotantes,
            totalMovilizadores: movilizadoresConPorcentaje.length,
            promedioPorMovilizador:
              movilizadoresConPorcentaje.length > 0
                ? Math.round(
                    totalVotantesMovilizadores /
                      movilizadoresConPorcentaje.length
                  )
                : 0,
          };
        });

      const totalMovilizadores = seccionalesConstruidos.reduce(
        (total, seccional) => total + seccional.totalMovilizadores,
        0
      );

      const totalVotantes = seccionalesConstruidos.reduce(
        (total, seccional) => total + seccional.totalVotantes,
        0
      );

      return {
        usuario: coordinador,
        seccionales: seccionalesConstruidos.sort(
          (a, b) => b.totalVotantes - a.totalVotantes
        ),
        totalSeccionales: seccionalesConstruidos.length,
        totalMovilizadores,
        totalVotantes,
      };
    });
  }

  async importarSeccionesDesdeArchivo(event: Event): Promise<void> {
    this.limpiarMensajes();

    const input = event.target as HTMLInputElement;
    const archivo = input.files?.[0];

    if (!archivo) {
      return;
    }

    try {
      this.importandoSecciones = true;
      this.cd.detectChanges();

      const filas = await this.leerArchivoExcel(archivo);

      let guardadas = 0;
      let omitidas = 0;

      for (const fila of filas) {
        const seccion = Number(
          fila['seccion'] || fila['Seccion'] || fila['SECCION']
        );

        const municipio = this.obtenerTexto(
          fila['municipio'] || fila['Municipio'] || fila['MUNICIPIO']
        );

        const colonia = this.obtenerTexto(
          fila['colonia'] || fila['Colonia'] || fila['COLONIA']
        );

        const activo = this.obtenerActivo(fila['activo'] ?? fila['Activo']);

        if (!seccion || !municipio) {
          omitidas++;
          continue;
        }

        await this.seccionesService.guardarSeccion({
          seccion,
          municipio,
          colonia,
          activo,
        });

        guardadas++;
      }

      this.mensajeExito =
        `Importación completada. Secciones guardadas: ${guardadas}. ` +
        `Filas omitidas: ${omitidas}.`;

      this.abrirPanel('secciones');
    } catch (error) {
      console.error('Error al importar secciones:', error);
      this.mensajeError = 'No se pudieron importar las secciones.';
    } finally {
      this.importandoSecciones = false;
      input.value = '';
      this.cd.detectChanges();
    }
  }

  async importarColoniasDesdeArchivo(event: Event): Promise<void> {
    this.limpiarMensajes();

    const input = event.target as HTMLInputElement;
    const archivo = input.files?.[0];

    if (!archivo) {
      return;
    }

    try {
      this.importandoColonias = true;
      this.cd.detectChanges();

      const filas = await this.leerArchivoExcel(archivo);

      let guardadas = 0;
      let omitidas = 0;

      for (const fila of filas) {
        const nombre = this.obtenerTexto(
          fila['nombre'] || fila['Nombre'] || fila['NOMBRE']
        );

        const municipio = this.obtenerTexto(
          fila['municipio'] || fila['Municipio'] || fila['MUNICIPIO']
        );

        const activo = this.obtenerActivo(fila['activo'] ?? fila['Activo']);

        if (!nombre || !municipio) {
          omitidas++;
          continue;
        }

        await this.coloniasService.guardarColoniaImportada({
          nombre,
          municipio,
          activo,
        });

        guardadas++;
      }

      this.mensajeExito =
        `Importación completada. Colonias guardadas: ${guardadas}. ` +
        `Filas omitidas: ${omitidas}.`;

      this.abrirPanel('colonias');
    } catch (error) {
      console.error('Error al importar colonias:', error);
      this.mensajeError = 'No se pudieron importar las colonias.';
    } finally {
      this.importandoColonias = false;
      input.value = '';
      this.cd.detectChanges();
    }
  }

  private leerArchivoExcel(archivo: File): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const lector = new FileReader();

      lector.onload = () => {
        try {
          const datos = new Uint8Array(lector.result as ArrayBuffer);
          const libro = XLSX.read(datos, {
            type: 'array',
          });

          const primeraHoja = libro.SheetNames[0];
          const hoja = libro.Sheets[primeraHoja];

          const filas = XLSX.utils.sheet_to_json(hoja, {
            defval: '',
          });

          resolve(filas);
        } catch (error) {
          reject(error);
        }
      };

      lector.onerror = () => reject(lector.error);
      lector.readAsArrayBuffer(archivo);
    });
  }

  private obtenerTexto(valor: unknown): string {
    return String(valor || '').trim();
  }

  private obtenerActivo(valor: unknown): boolean {
    if (typeof valor === 'boolean') {
      return valor;
    }

    const texto = String(valor || '').trim().toLowerCase();

    if (
      texto === 'false' ||
      texto === 'no' ||
      texto === '0' ||
      texto === 'inactivo'
    ) {
      return false;
    }

    return true;
  }

  limpiarMensajes(): void {
    this.mensajeExito = '';
    this.mensajeError = '';
  }
}