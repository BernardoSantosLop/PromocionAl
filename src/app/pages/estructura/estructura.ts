import { RecorteIneService } from '../../core/services/recorte-ine.service';
import { DialogosService } from '../../core/services/dialogos.service';
import { SelectorBuscable } from '../../shared/components/selector-buscable/selector-buscable';
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { combineLatest, firstValueFrom, map, shareReplay, of, startWith, switchMap, timeout } from 'rxjs';
import * as XLSX from 'xlsx';

import { Colonia } from '../../core/models/colonia.model';
import { SeccionElectoral } from '../../core/models/seccion-electoral.model';
import { RolUsuario, UsuarioSistema, fichaEnlaceVacia, validarFichaMovilizador } from '../../core/models/usuario-sistema.model';
import { DatosMovilizador } from '../../shared/components/datos-movilizador/datos-movilizador';
import { agruparMovilizadores, crearBoletaMovilizadoresHtml } from '../../core/printing/boleta-movilizadores';
import { crearListaSimpatizantesHtml } from '../../core/printing/lista-simpatizantes';
import { crearBoletaEnlaceHtml } from '../../core/printing/boleta-enlace';
import { ImpresionRutaService } from '../../core/printing/impresion-ruta.service';
import { IneOcrService } from '../../core/services/ine-ocr.service';
import { Votante } from '../../core/models/votante.model';

import { ColoniasService } from '../../core/services/colonias.service';
import { SeccionesElectoralesService } from '../../core/services/secciones-electorales.service';
import { UsuariosService } from '../../core/services/usuarios.service';
import { VotantesService } from '../../core/services/votantes.service';

import { JerarquiaService } from '../../core/services/jerarquia.service';
import { Jerarquia } from '../../shared/components/jerarquia/jerarquia';
import { NOMBRES_ROL } from '../../core/models/usuario-sistema.model';

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
  enlaceUid?: string;
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
  imports: [CommonModule, FormsModule, Jerarquia, DatosMovilizador, SelectorBuscable],
  templateUrl: './estructura.html',
  styleUrl: './estructura.css',
  providers: [ImpresionRutaService],
})
export class Estructura implements OnDestroy {
  private recorteIne = inject(RecorteIneService);
  private dialogos = inject(DialogosService);
  private seccionesService = inject(SeccionesElectoralesService);
  private coloniasService = inject(ColoniasService);
  private usuariosService = inject(UsuariosService);
  private votantesService = inject(VotantesService);
  private cd = inject(ChangeDetectorRef);
  private jerarquiaService = inject(JerarquiaService);
  private impresion = inject(ImpresionRutaService);
  private ineOcr = inject(IneOcrService);
  fichaEnlace = fichaEnlaceVacia();
  fichaMovilizadorMonitoreo = fichaEnlaceVacia();
  leyendoIneMovilizador = false;
  leyendoIneMovilizadorMonitoreo = false;
  enlaceListadoUid = '';
  delegadoListadoUid = '';

  delegadoDelListado(usuarios: UsuarioSistema[]): string {
    const enlace = usuarios.find((usuario) => usuario.uid === this.enlaceListadoUid);
    return enlace ? (enlace.seccionalUid || enlace.delegadoUid || '') : this.delegadoListadoUid;
  }

  cambiarDelegadoListado(uid: string): void {
    this.delegadoListadoUid = uid;
    this.enlaceListadoUid = '';
  }

  opcionesListado(usuarios: UsuarioSistema[], rol: 'seccional' | 'enlace'): UsuarioSistema[] {
    const delegadoUid = this.delegadoDelListado(usuarios);
    return usuarios.filter((usuario) =>
      usuario.rol === rol &&
      (rol === 'seccional' || (!!delegadoUid && (usuario.seccionalUid || usuario.delegadoUid) === delegadoUid)),
    ).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }
  imprimiendoSimpatizantesUid = '';
  imagenesProcesando = 0;
  leyendoIneEnlace = false;

  ngOnDestroy(): void {
    this.impresion.limpiar();
  }
  nombresRol = NOMBRES_ROL;
  passwordUsuario = '';
  passwordMovilizador = '';
  guardandoUsuario = false;
  guardandoMovilizador = false;
  recuperandoUid = new URLSearchParams(location.search).has('recuperarUid');

  rolUsuarioActual = (localStorage.getItem('rolUsuario') || '') as RolUsuario;
  uidUsuarioActual =
    localStorage.getItem('uidUsuario') ||
    localStorage.getItem('usuarioUid') ||
    localStorage.getItem('uid') ||
    '';
  nombreUsuarioActual =
    localStorage.getItem('nombreUsuario') || localStorage.getItem('usuarioNombre') || '';

  esCoordinador = this.rolUsuarioActual === 'coordinador';
  esSeccional = this.rolUsuarioActual === 'seccional';
  esEnlace = this.rolUsuarioActual === 'enlace';

  tabActivo: TabEstructura = this.esSeccional ? 'usuarios' : this.esEnlace ? 'jerarquia' : 'secciones';

  panelesAbiertos: Record<TabEstructura, boolean> = {
    secciones: false,
    colonias: false,
    usuarios: this.esSeccional,
    jerarquia: this.esEnlace,
  };

  mensajeExito = '';
  mensajeError = '';

  importandoSecciones = false;
  importandoColonias = false;

  editandoColoniaId = '';
  seccionesColoniaTexto = '';
  editandoUsuarioId = '';
  eliminandoSeccionId = '';
  eliminandoColoniaId = '';

  secciones$ = this.seccionesService.obtenerSecciones().pipe(
    shareReplay({
      bufferSize: 1,
      refCount: true,
    }),
  );

  colonias$ = this.coloniasService.obtenerColonias().pipe(
    shareReplay({
      bufferSize: 1,
      refCount: true,
    }),
  );

  usuarios$ = (this.esEnlace || this.esSeccional
    ? this.jerarquiaService.cambios$.pipe(
        startWith(undefined),
        switchMap(() => this.jerarquiaService.listar()),
        map((datos) => datos.usuarios),
      )
    : this.usuariosService.obtenerUsuarios()
  ).pipe(
    shareReplay({
      bufferSize: 1,
      refCount: true,
    }),
  );

  votantes$ = (this.esEnlace || this.esSeccional ? of<Votante[]>([]) : this.votantesService.obtenerVotantes()).pipe(
    shareReplay({
      bufferSize: 1,
      refCount: true,
    }),
  );

  coordinadores$ = this.usuarios$.pipe(
    map((usuarios) =>
      usuarios
        .filter((usuario) => usuario.rol === 'coordinador')
        .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    ),
  );

  seccionales$ = this.usuarios$.pipe(
    map((usuarios) =>
      usuarios
        .filter((usuario) => usuario.rol === 'seccional')
        .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    ),
  );

  enlaces$ = this.usuarios$.pipe(
    map((usuarios) =>
      usuarios
        .filter((usuario) => usuario.rol === 'enlace' && usuario.activo)
        .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    ),
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
            (seccional) => seccional.usuario.uid === this.uidUsuarioActual,
          );

          const totalMovilizadores = seccionalesPropios.reduce(
            (total, seccional) => total + seccional.totalMovilizadores,
            0,
          );

          const totalVotantes = seccionalesPropios.reduce(
            (total, seccional) => total + seccional.totalVotantes,
            0,
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
    }),
  );

  formSeccion: SeccionElectoral = {
    seccion: 0,
    municipio: 'San Juan Bautista Tuxtepec',
    colonia: '',
    activo: true,
  };

  formColonia: Omit<Colonia, 'id'> = {
    nombre: '',
    tipo: 'COLONIA',
    secciones: [],
    municipio: 'San Juan Bautista Tuxtepec',
    activo: true,
  };

  formUsuario: UsuarioSistema = {
    uid: '',
    nombre: '',
    correo: '',
    rol: this.esSeccional ? 'enlace' : 'movilizador',
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
    return this.esCoordinador || (this.esSeccional && panel === 'usuarios') || (this.esEnlace && panel === 'jerarquia');
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

  async eliminarSeccion(seccion: SeccionElectoral): Promise<void> {
    if (!seccion.id || this.eliminandoSeccionId || !this.esCoordinador) return;
    if (
      !(await this.dialogos.confirmar(`¿Eliminar definitivamente la sección electoral ${seccion.seccion}? Esta acción no se puede deshacer.`))
    )
      return;
    this.limpiarMensajes();
    this.eliminandoSeccionId = seccion.id;
    try {
      await this.seccionesService.eliminarSeccion(seccion.id);
      if (this.formSeccion.id === seccion.id) this.limpiarFormularioSeccion();
      this.mensajeExito = 'Sección eliminada correctamente.';
      this.abrirPanel('secciones');
    } catch (error) {
      console.error('Error al eliminar sección:', error);
      this.mensajeError = 'No se pudo eliminar la sección.';
    } finally {
      this.eliminandoSeccionId = '';
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
    const secciones = this.seccionesColoniaTexto.trim()
      ? [...new Set(this.seccionesColoniaTexto.split(',').map((valor) => Number(valor.trim())))].sort((a, b) => a - b)
      : [];
    if (secciones.some((valor) => !Number.isInteger(valor) || valor <= 0)) {
      this.mensajeError = 'Escribe números de sección válidos separados por comas.';
      return;
    }
    this.formColonia.secciones = secciones;

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
      tipo: colonia.tipo || 'COLONIA',
      secciones: colonia.secciones || [],
      municipio: colonia.municipio,
      activo: colonia.activo,
    };
    this.seccionesColoniaTexto = (colonia.secciones || []).join(', ');

    this.abrirPanel('colonias');
    this.limpiarMensajes();
  }

  async eliminarColonia(colonia: Colonia): Promise<void> {
    if (!colonia.id || this.eliminandoColoniaId || !this.esCoordinador) return;
    if (
      !(await this.dialogos.confirmar(`¿Eliminar definitivamente la colonia “${colonia.nombre}”? Esta acción no se puede deshacer.`))
    )
      return;
    this.limpiarMensajes();
    this.eliminandoColoniaId = colonia.id;
    try {
      await this.coloniasService.eliminarColonia(colonia.id);
      if (this.editandoColoniaId === colonia.id) this.limpiarFormularioColonia();
      this.mensajeExito = 'Colonia eliminada correctamente.';
      this.abrirPanel('colonias');
    } catch (error) {
      console.error('Error al eliminar colonia:', error);
      this.mensajeError = 'No se pudo eliminar la colonia.';
    } finally {
      this.eliminandoColoniaId = '';
      this.cd.detectChanges();
    }
  }

  limpiarFormularioColonia(): void {
    this.editandoColoniaId = '';
    this.seccionesColoniaTexto = '';

    this.formColonia = {
      nombre: '',
      tipo: 'COLONIA',
      secciones: [],
      municipio: 'San Juan Bautista Tuxtepec',
      activo: true,
    };
  }

  async guardarUsuario(): Promise<void> {
    if (this.guardandoUsuario || this.imagenesProcesando || this.leyendoIneEnlace || this.leyendoIneMovilizador) return;
    this.limpiarMensajes();
    const usuario = this.formUsuario;
    if (this.esSeccional) usuario.seccionalUid = this.uidUsuarioActual;
    const responsableUid = usuario.rol === 'enlace' ? usuario.seccionalUid : usuario.enlaceUid;
    if (!this.esCoordinador && !(this.esSeccional && usuario.rol === 'enlace')) this.mensajeError = 'Solo puedes crear enlaces asignados a tu delegado.';
    else if (!usuario.nombre.trim() || !usuario.correo.trim())
      this.mensajeError = 'Captura el nombre y correo del usuario.';
    else if (usuario.rol === 'seccional' && !usuario.coordinadorUid)
      this.mensajeError = 'Selecciona el coordinador responsable.';
    else if ((usuario.rol === 'enlace' || usuario.rol === 'movilizador') && !responsableUid)
      this.mensajeError =
        usuario.rol === 'enlace'
          ? 'Selecciona el delegado responsable.'
          : 'Selecciona el enlace responsable.';
    else if (!usuario.uid && this.passwordUsuario.length < 6)
      this.mensajeError = 'La contraseña debe tener al menos 6 caracteres.';
    if (!this.mensajeError && usuario.rol === 'enlace') {
      const ficha = this.fichaEnlace;
      if (!ficha.domicilio.trim() || !ficha.colonia.trim()) this.mensajeError = 'Captura domicilio y colonia o localidad del enlace.';
      else if (!/^\d{5}$/.test(ficha.codigoPostal)) this.mensajeError = 'El código postal debe tener 5 dígitos.';
      else if (!/^[A-Z0-9]{18}$/i.test(ficha.claveElector.trim())) this.mensajeError = 'La clave de elector debe tener 18 caracteres.';
      else if (!/^[A-Z0-9]{18}$/i.test(ficha.curp.trim())) this.mensajeError = 'La CURP debe tener 18 caracteres.';
      else if (!/^\d{10}$/.test(ficha.celular)) this.mensajeError = 'El celular debe tener 10 dígitos.';
      else if (!Number.isInteger(Number(ficha.seccion)) || Number(ficha.seccion) <= 0) this.mensajeError = 'Captura una sección electoral válida.';
      else if (!ficha.ineFrente || !ficha.ineReverso) this.mensajeError = 'Carga el frente y el reverso de la INE.';
    }
    if (!this.mensajeError && usuario.rol === 'movilizador') this.mensajeError = validarFichaMovilizador(this.fichaEnlace);
    if (this.mensajeError) {
      this.cd.detectChanges();
      return;
    }
    this.guardandoUsuario = true;
    try {
      if (!usuario.uid) {
        usuario.uid = await this.jerarquiaService.crearCuenta(usuario.correo, this.passwordUsuario);
        this.passwordUsuario = '';
      }
      if (usuario.rol === 'enlace' || usuario.rol === 'movilizador') {
        await this.jerarquiaService.guardar(usuario.rol === 'movilizador' ? { ...usuario, fichaRegistro: { ...this.fichaEnlace, ineFrente: '', ineReverso: '' } } : this.esSeccional ? { ...usuario, fichaRegistro: { ...this.fichaEnlace } } : usuario, responsableUid!);
        if (usuario.rol === 'movilizador') this.enlaceListadoUid = responsableUid!;
        if (usuario.rol === 'enlace' && this.esCoordinador) {
          await this.usuariosService.guardarFichaEnlace(usuario.uid, {
            ...this.fichaEnlace,
            domicilio: this.fichaEnlace.domicilio.trim(),
            colonia: this.fichaEnlace.colonia.trim(),
            claveElector: this.fichaEnlace.claveElector.trim().toUpperCase(),
            curp: this.fichaEnlace.curp.trim().toUpperCase(),
            facebook: this.fichaEnlace.facebook.trim(),
            seccion: Number(this.fichaEnlace.seccion),
          });
        }
      } else {
        const usuarios = await firstValueFrom(this.usuarios$);
        const coordinador = usuarios.find((item) => item.uid === usuario.coordinadorUid);
        await this.usuariosService.guardarUsuario({
          ...usuario,
          nombre: usuario.nombre.trim(),
          correo: usuario.correo.trim(),
          coordinadorUid: usuario.rol === 'seccional' ? usuario.coordinadorUid || '' : '',
          coordinadorNombre: usuario.rol === 'seccional' ? coordinador?.nombre || '' : '',
          seccionalUid: '',
          seccionalNombre: '',
          delegadoUid: '',
          delegadoNombre: '',
          enlaceUid: '',
          enlaceNombre: '',
        });
        this.jerarquiaService.notificarCambios();
      }
      this.mensajeExito = this.editandoUsuarioId
        ? 'Usuario actualizado correctamente.'
        : 'Cuenta y perfil de usuario guardados correctamente.';
      this.limpiarFormularioUsuario();
      this.abrirPanel('usuarios');
    } catch (error) {
      this.mensajeError = error instanceof Error ? error.message : 'No se pudo guardar el usuario.';
    } finally {
      this.guardandoUsuario = false;
      this.cd.detectChanges();
    }
  }

  editarUsuario(usuario: UsuarioSistema): void {
    if (this.esSeccional && (usuario.rol !== 'enlace' || (usuario.delegadoUid || usuario.seccionalUid) !== this.uidUsuarioActual)) return;
    this.editandoUsuarioId = usuario.uid;
    this.passwordUsuario = '';
    this.fichaEnlace = { ...fichaEnlaceVacia(), ...usuario.fichaRegistro };

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
      enlaceUid: usuario.enlaceUid || '',
      enlaceNombre: usuario.enlaceNombre || '',
      delegadoUid: usuario.delegadoUid || '',
      delegadoNombre: usuario.delegadoNombre || '',
    };

    this.abrirPanel('usuarios');
    this.limpiarMensajes();
  }

  async eliminarUsuario(usuario: UsuarioSistema): Promise<void> {
    if (this.guardandoUsuario || usuario.rol === 'coordinador') return;
    if (
      !(await this.dialogos.confirmar('¿Eliminar definitivamente a ' + usuario.nombre + '? Se borrarán su acceso y su perfil.'))
    )
      return;
    this.guardandoUsuario = true;
    this.limpiarMensajes();
    try {
      await this.jerarquiaService.eliminarUsuario(usuario.uid);
      if (this.editandoUsuarioId === usuario.uid) this.limpiarFormularioUsuario();
      this.mensajeExito = 'Usuario eliminado correctamente.';
    } catch (error) {
      this.mensajeError =
        error instanceof Error ? error.message : 'No se pudo eliminar el usuario.';
    } finally {
      this.guardandoUsuario = false;
      this.cd.detectChanges();
    }
  }

  limpiarFormularioUsuario(): void {
    this.editandoUsuarioId = '';
    this.passwordUsuario = '';
    this.fichaEnlace = fichaEnlaceVacia();

    this.formUsuario = {
      uid: '',
      nombre: '',
      correo: '',
      rol: this.esSeccional ? 'enlace' : 'movilizador',
      activo: true,
      coordinadorUid: '',
      coordinadorNombre: '',
      seccionalUid: '',
      seccionalNombre: '',
    };
  }

  imprimirBoletaEnlace(usuario: UsuarioSistema): void {
    if (usuario.rol !== 'enlace' || (!this.esCoordinador && !(this.esSeccional && (usuario.delegadoUid || usuario.seccionalUid) === this.uidUsuarioActual))) return;
    this.impresion.imprimir(crearBoletaEnlaceHtml(usuario), 'Boleta de registro de enlace');
  }

  gruposMovilizadores(usuarios: UsuarioSistema[]): UsuarioSistema[][] {
    return agruparMovilizadores(usuarios, this.esEnlace ? this.uidUsuarioActual : this.enlaceListadoUid);
  }

  imprimirMovilizadores(usuarios: UsuarioSistema[], grupo?: number): void {
    const enlaceUid = this.esEnlace ? this.uidUsuarioActual : this.enlaceListadoUid;
    const enlace = usuarios.find((u) => u.uid === enlaceUid && u.rol === 'enlace');
    const grupos = this.gruposMovilizadores(usuarios);
    if ((!this.esCoordinador && !this.esEnlace) || !enlace || !grupos.length || (grupo !== undefined && !grupos[grupo])) return;
    const lista = grupo === undefined ? grupos.flat() : grupos[grupo];
    this.impresion.imprimir(crearBoletaMovilizadoresHtml(enlace, lista, grupo === undefined ? 1 : grupo * 5 + 1), 'Registro de movilizadores por enlace');
  }

  async imprimirSimpatizantes(movilizador: UsuarioSistema): Promise<void> {
    if (this.imprimiendoSimpatizantesUid || movilizador.rol !== 'movilizador' || (!this.esCoordinador && !(this.esEnlace && movilizador.enlaceUid === this.uidUsuarioActual))) return;
    this.limpiarMensajes();
    this.imprimiendoSimpatizantesUid = movilizador.uid;
    try {
      const personas = await this.votantesService.obtenerSimpatizantesDeMovilizador(movilizador.uid);
      if (!personas.length) { this.mensajeError = 'Este movilizador todavía no tiene simpatizantes registrados.'; return; }
      this.impresion.imprimir(crearListaSimpatizantesHtml(movilizador, personas), 'Simpatizantes del movilizador · 10 por hoja');
    } catch (error) { this.mensajeError = error instanceof Error ? error.message : 'No se pudo preparar la lista de simpatizantes.'; }
    finally { this.imprimiendoSimpatizantesUid = ''; this.cd.detectChanges(); }
  }

  async rellenarEnlaceDesdeIne(): Promise<void> {
    if (this.leyendoIneEnlace || !this.fichaEnlace.ineFrente || this.guardandoUsuario) return;
    this.limpiarMensajes();
    if (!navigator.onLine) {
      this.mensajeError = 'La foto está lista. Necesitas internet para leer la INE automáticamente; también puedes capturar los datos a mano.';
      return;
    }
    const ficha = this.fichaEnlace;
    const usuario = this.formUsuario;
    this.leyendoIneEnlace = true;
    this.cd.detectChanges();
    try {
      const respuesta = await this.ineOcr.leerIne(ficha.ineFrente);
      if (this.fichaEnlace !== ficha || this.formUsuario !== usuario || usuario.rol !== 'enlace') return;
      if (!respuesta.ok || !respuesta.datos) throw new Error('No se pudieron detectar datos. Intenta otra foto o captura los datos a mano.');
      const datos = respuesta.datos;
      const detectados: string[] = [];
      if (datos.nombreCompleto?.trim()) { usuario.nombre = datos.nombreCompleto.trim(); detectados.push('nombre'); }
      if (datos.direccion?.trim()) { ficha.domicilio = datos.direccion.trim(); detectados.push('domicilio'); }
      if (datos.claveElector?.trim()) { ficha.claveElector = datos.claveElector.trim().toUpperCase(); detectados.push('clave de elector'); }
      if (datos.curp?.trim()) { ficha.curp = datos.curp.trim().toUpperCase(); detectados.push('CURP'); }
      if (Number.isInteger(datos.seccion) && Number(datos.seccion) > 0) { ficha.seccion = Number(datos.seccion); detectados.push('sección'); }
      if (datos.colonia?.trim()) {
        ficha.colonia = datos.colonia.trim();
        const normalizar = (valor: string) => valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase().replace(/\s+/g, ' ');
        const colonias = await firstValueFrom(this.colonias$.pipe(timeout(3000))).catch(() => [] as Colonia[]);
        if (this.fichaEnlace !== ficha || this.formUsuario !== usuario) return;
        const encontrada = colonias.find((colonia) => normalizar(colonia.nombre) === normalizar(ficha.colonia) && (!ficha.seccion || !colonia.secciones?.length || colonia.secciones.includes(ficha.seccion)));
        if (encontrada) ficha.colonia = encontrada.nombre;
        detectados.push('colonia o localidad');
      }
      const cp = datos.codigoPostal?.match(/^\d{5}$/)?.[0]
        || datos.direccion?.match(/\b(\d{5})\b/)?.[1]
        || respuesta.texto?.match(/\bC\.?\s*P\.?\s*:?\s*(\d{5})\b/i)?.[1];
      if (cp) { ficha.codigoPostal = cp; detectados.push('código postal'); }
      if (detectados.length) this.mensajeExito = `INE leída: ${detectados.join(', ')}. Revisa los datos antes de guardar. Completa celular, correo y Facebook manualmente.`;
      else this.mensajeError = 'No se detectaron datos claros. Intenta otra foto con buena luz o captura los datos a mano.';
    } catch (error) {
      if (this.fichaEnlace === ficha && this.formUsuario === usuario) this.mensajeError = `La foto se conservó, pero no se pudo leer la INE. ${error instanceof Error ? error.message : 'Intenta de nuevo o captura los datos a mano.'}`;
    } finally {
      this.leyendoIneEnlace = false;
      this.cd.detectChanges();
    }
  }

  async cargarIneEnlace(event: Event, lado: 'ineFrente' | 'ineReverso'): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (this.guardandoUsuario || this.imagenesProcesando || this.leyendoIneEnlace) { input.value = ''; return; }
    const archivo = input.files?.[0];
    if (!archivo) return;
    this.limpiarMensajes();
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(archivo.type) || archivo.size > 12 * 1024 * 1024) {
      this.mensajeError = 'Selecciona una imagen JPG, PNG o WebP de hasta 12 MB.';
      input.value = '';
      return;
    }
    const fichaDestino = this.fichaEnlace;
    this.imagenesProcesando++;
    try {
      const recortada = await this.recorteIne.editar(archivo);
      if (!recortada) return;
      const bitmap = await createImageBitmap(recortada, { imageOrientation: 'from-image' });
      const escala = Math.min(1, 1100 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * escala));
      canvas.height = Math.max(1, Math.round(bitmap.height * escala));
      const contexto = canvas.getContext('2d');
      if (!contexto) { bitmap.close(); throw new Error('No se pudo preparar la imagen.'); }
      contexto.fillStyle = '#fff';
      contexto.fillRect(0, 0, canvas.width, canvas.height);
      contexto.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      let imagen = '';
      for (const calidad of [0.85, 0.7, 0.55, 0.4]) {
        imagen = canvas.toDataURL('image/jpeg', calidad);
        if (imagen.length <= 240000) break;
      }
      if (imagen.length > 240000) throw new Error('La imagen tiene demasiado detalle. Usa una fotografía más recortada de la INE.');
      fichaDestino[lado] = imagen;
      if (lado === 'ineFrente' && this.fichaEnlace === fichaDestino) await this.rellenarEnlaceDesdeIne();
    } catch (error) {
      this.mensajeError = error instanceof Error ? error.message : 'No se pudo leer la imagen.';
    } finally {
      this.imagenesProcesando--;
      input.value = '';
      this.cd.detectChanges();
    }
  }

  async ajustarIneEnlace(lado: 'ineFrente' | 'ineReverso'): Promise<void> {
    if (this.guardandoUsuario || this.imagenesProcesando || this.leyendoIneEnlace || !this.fichaEnlace[lado]) return;
    try {
      const blob = await (await fetch(this.fichaEnlace[lado])).blob();
      const archivo = new File([blob], 'ine.jpg', { type: blob.type });
      await this.cargarIneEnlace({ target: { files: [archivo], value: '' } } as unknown as Event, lado);
    } catch { this.mensajeError = 'No se pudo abrir la foto guardada. Selecciona otra imagen.'; this.cd.detectChanges(); }
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
      (usuario) => usuario.rol === 'movilizador' && usuario.activo,
    );

    const filtrados = this.esSeccional
      ? movilizadores.filter((movilizador) => movilizador.seccionalUid === this.uidUsuarioActual)
      : movilizadores;

    return filtrados.sort((a, b) => a.nombre.localeCompare(b.nombre));
  }

  obtenerSeccionalesMonitoreoFiltrados(
    usuarios: UsuarioSistema[],
    busqueda: string,
  ): UsuarioSistema[] {
    return this.obtenerSeccionalesMonitoreo(usuarios).filter((seccional) =>
      this.coincideUsuarioConBusqueda(seccional, busqueda),
    );
  }

  obtenerMovilizadoresMonitoreoFiltrados(
    usuarios: UsuarioSistema[],
    busqueda: string,
  ): UsuarioSistema[] {
    return this.obtenerMovilizadoresMonitoreo(usuarios).filter((movilizador) =>
      this.coincideUsuarioConBusqueda(movilizador, busqueda),
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
    busqueda: string,
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
        }`,
      );

      return textoVotante.includes(textoBusqueda);
    });
  }

  private coincideUsuarioConBusqueda(usuario: UsuarioSistema, busqueda: string): boolean {
    const textoBusqueda = this.normalizarTextoBusqueda(busqueda);

    if (!textoBusqueda) {
      return true;
    }

    const textoUsuario = this.normalizarTextoBusqueda(
      `${usuario.nombre || ''} ${usuario.correo || ''} ${usuario.uid || ''} ${
        usuario.rol || ''
      } ${usuario.coordinadorNombre || ''} ${usuario.seccionalNombre || ''}`,
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
    if (this.guardandoMovilizador || this.leyendoIneMovilizadorMonitoreo) return;
    this.limpiarMensajes();
    const formulario = this.formMovilizadorMonitoreo;
    if (!this.esCoordinador && !this.esEnlace)
      this.mensajeError = 'No tienes permiso para agregar movilizadores.';
    else if (!formulario.nombre.trim() || !formulario.correo.trim())
      this.mensajeError = 'Captura el nombre y correo del movilizador.';
    else if (this.esCoordinador && !formulario.enlaceUid)
      this.mensajeError = 'Selecciona el enlace responsable.';
    else if (!formulario.uid && this.passwordMovilizador.length < 6)
      this.mensajeError = 'La contraseña debe tener al menos 6 caracteres.';
    if (!this.mensajeError) this.mensajeError = validarFichaMovilizador(this.fichaMovilizadorMonitoreo);
    if (this.mensajeError) {
      this.cd.detectChanges();
      return;
    }
    this.guardandoMovilizador = true;
    try {
      if (!formulario.uid) {
        try {
          formulario.uid = await this.jerarquiaService.crearCuenta(
            formulario.correo,
            this.passwordMovilizador,
          );
        } catch (error) {
          if (!this.esEnlace || (error as { code?: string }).code !== 'EMAIL_EXISTS') throw error;
          formulario.uid = await this.jerarquiaService.recuperarMovilizador(
            formulario.nombre.trim(),
            formulario.correo.trim(),
          );
          this.passwordMovilizador = '';
        }
        this.passwordMovilizador = '';
      }
      const usuario: UsuarioSistema = {
        uid: formulario.uid,
        nombre: formulario.nombre.trim(),
        correo: formulario.correo.trim(),
        rol: 'movilizador',
        activo: true,
        fichaRegistro: { ...this.fichaMovilizadorMonitoreo, ineFrente: '', ineReverso: '' },
      };
      if (this.esEnlace || this.esCoordinador) {
        const enlaceUid = this.esEnlace ? this.uidUsuarioActual : formulario.enlaceUid!;
        await this.jerarquiaService.guardar(usuario, enlaceUid);
        this.enlaceListadoUid = enlaceUid;
      } else {
        const usuarios = await firstValueFrom(this.usuarios$);
        const delegado = this.esSeccional
          ? { uid: this.uidUsuarioActual, nombre: this.nombreUsuarioActual }
          : usuarios.find(
              (item) => item.uid === formulario.seccionalUid && item.rol === 'seccional',
            );
        if (!delegado) throw new Error('No se encontró el delegado seleccionado.');
        await this.usuariosService.guardarUsuario({
          ...usuario,
          seccionalUid: delegado.uid,
          seccionalNombre: delegado.nombre,
        });
        this.jerarquiaService.notificarCambios();
      }
      this.mensajeExito = 'Movilizador guardado correctamente.';
      this.limpiarFormularioMovilizadorMonitoreo();
      this.abrirPanel('jerarquia');
    } catch (error) {
      this.mensajeError =
        error instanceof Error ? error.message : 'No se pudo guardar el movilizador.';
    } finally {
      this.guardandoMovilizador = false;
      this.cd.detectChanges();
    }
  }

  async asignarMovilizadorASeccionalDesdeMonitoreo(): Promise<void> {
    this.limpiarMensajes();

    if (!this.esCoordinador) {
      this.mensajeError = 'Solo el coordinador puede reasignar movilizadores entre delegados.';
      this.cd.detectChanges();
      return;
    }

    if (!this.formAsignacionMovilizadorMonitoreo.movilizadorUid) {
      this.mensajeError = 'Selecciona el movilizador que quieres asignar.';
      this.cd.detectChanges();
      return;
    }

    if (!this.formAsignacionMovilizadorMonitoreo.seccionalUid) {
      this.mensajeError = 'Selecciona el delegado responsable.';
      this.cd.detectChanges();
      return;
    }

    try {
      const usuarios = await firstValueFrom(this.usuarios$);
      const movilizador = usuarios.find(
        (usuario) =>
          usuario.uid === this.formAsignacionMovilizadorMonitoreo.movilizadorUid &&
          usuario.rol === 'movilizador',
      );
      const seccional = usuarios.find(
        (usuario) =>
          usuario.uid === this.formAsignacionMovilizadorMonitoreo.seccionalUid &&
          usuario.rol === 'seccional',
      );

      if (!movilizador) {
        this.mensajeError = 'No se encontró el movilizador seleccionado.';
        this.cd.detectChanges();
        return;
      }

      if (!seccional) {
        this.mensajeError = 'No se encontró el delegado seleccionado.';
        this.cd.detectChanges();
        return;
      }

      await this.usuariosService.guardarUsuario({
        ...movilizador,
        seccionalUid: seccional.uid,
        seccionalNombre: seccional.nombre,
        delegadoUid: seccional.uid,
        delegadoNombre: seccional.nombre,
        enlaceUid: '',
        enlaceNombre: '',
      });
      this.jerarquiaService.notificarCambios();

      this.mensajeExito = 'Movilizador asignado correctamente al delegado.';
      this.limpiarFormularioAsignacionMovilizadorMonitoreo();
      this.abrirPanel('jerarquia');
    } catch (error) {
      console.error('Error al asignar movilizador desde monitoreo:', error);
      this.mensajeError = 'No se pudo asignar el movilizador al delegado.';
    } finally {
      this.cd.detectChanges();
    }
  }

  async asignarVotanteAMovilizadorDesdeMonitoreo(): Promise<void> {
    this.limpiarMensajes();

    if (!this.esCoordinador) {
      this.mensajeError =
        'Solo el coordinador puede asignar simpatizantes a movilizadores desde monitoreo.';
      this.cd.detectChanges();
      return;
    }

    if (!this.formAsignacionVotanteMonitoreo.votanteId) {
      this.mensajeError = 'Selecciona el simpatizante que quieres asignar.';
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
          usuario.rol === 'movilizador',
      );

      if (!movilizador) {
        this.mensajeError = 'No se encontró el movilizador seleccionado.';
        this.cd.detectChanges();
        return;
      }

      if (this.esSeccional && movilizador.seccionalUid !== this.uidUsuarioActual) {
        this.mensajeError = 'Solo puedes asignar simpatizantes a movilizadores de tu delegado.';
        this.cd.detectChanges();
        return;
      }

      const seccional = usuarios.find((usuario) => usuario.uid === movilizador.seccionalUid);

      await this.votantesService.actualizarVotante(this.formAsignacionVotanteMonitoreo.votanteId, {
        movilizadorUid: movilizador.uid,
        movilizadorNombre: movilizador.nombre,
        seccionalUid: movilizador.seccionalUid || '',
        seccionalNombre: movilizador.seccionalNombre || seccional?.nombre || '',
        asignadoPorUid: this.uidUsuarioActual,
        asignadoPorNombre: this.nombreUsuarioActual,
      });

      this.jerarquiaService.notificarCambios();
      this.mensajeExito = 'Simpatizante agregado correctamente al movilizador.';
      this.limpiarFormularioAsignacionVotanteMonitoreo();
      this.abrirPanel('jerarquia');
    } catch (error) {
      console.error('Error al asignar simpatizante desde monitoreo:', error);
      this.mensajeError = 'No se pudo agregar el simpatizante al movilizador.';
    } finally {
      this.cd.detectChanges();
    }
  }

  limpiarFormularioMovilizadorMonitoreo(): void {
    this.passwordMovilizador = '';
    this.fichaMovilizadorMonitoreo = fichaEnlaceVacia();
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

  construirJerarquia(usuarios: UsuarioSistema[], votantes: Votante[]): CoordinadorJerarquia[] {
    const coordinadores = usuarios.filter((usuario) => usuario.rol === 'coordinador');

    const seccionales = usuarios.filter((usuario) => usuario.rol === 'seccional');

    const movilizadores = usuarios.filter((usuario) => usuario.rol === 'movilizador');

    return coordinadores.map((coordinador) => {
      const seccionalesDelCoordinador = seccionales.filter(
        (seccional) => seccional.coordinadorUid === coordinador.uid,
      );

      const seccionalesConstruidos: SeccionalJerarquia[] = seccionalesDelCoordinador.map(
        (seccional) => {
          const movilizadoresDelSeccional = movilizadores.filter(
            (movilizador) => movilizador.seccionalUid === seccional.uid,
          );

          const movilizadoresBase = movilizadoresDelSeccional.map((movilizador) => {
            const votantesDelMovilizador = votantes.filter((votante) => {
              const votanteAsignado = votante as VotanteConAsignacion;

              return (
                votanteAsignado.movilizadorUid === movilizador.uid ||
                (!votanteAsignado.movilizadorUid && votante.capturadoPorUid === movilizador.uid)
              );
            });

            return {
              usuario: movilizador,
              votantes: votantesDelMovilizador,
              totalVotantes: votantesDelMovilizador.length,
              porcentajeDentroSeccional: 0,
            };
          });

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
            0,
          );

          const totalVotantes = totalVotantesMovilizadores + votantesDirectos.length;

          const movilizadoresConPorcentaje = movilizadoresBase
            .map((movilizador) => ({
              ...movilizador,
              porcentajeDentroSeccional:
                totalVotantes > 0
                  ? Math.round((movilizador.totalVotantes / totalVotantes) * 100)
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
                ? Math.round(totalVotantesMovilizadores / movilizadoresConPorcentaje.length)
                : 0,
          };
        },
      );

      const totalMovilizadores = seccionalesConstruidos.reduce(
        (total, seccional) => total + seccional.totalMovilizadores,
        0,
      );

      const totalVotantes = seccionalesConstruidos.reduce(
        (total, seccional) => total + seccional.totalVotantes,
        0,
      );

      return {
        usuario: coordinador,
        seccionales: seccionalesConstruidos.sort((a, b) => b.totalVotantes - a.totalVotantes),
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
        const seccion = Number(fila['seccion'] || fila['Seccion'] || fila['SECCION']);

        const municipio = this.obtenerTexto(
          fila['municipio'] || fila['Municipio'] || fila['MUNICIPIO'],
        );

        const colonia = this.obtenerTexto(fila['colonia'] || fila['Colonia'] || fila['COLONIA']);

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
        const nombre = this.obtenerTexto(fila['nombre'] || fila['Nombre'] || fila['NOMBRE']);

        const municipio = this.obtenerTexto(
          fila['municipio'] || fila['Municipio'] || fila['MUNICIPIO'],
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

    const texto = String(valor || '')
      .trim()
      .toLowerCase();

    if (texto === 'false' || texto === 'no' || texto === '0' || texto === 'inactivo') {
      return false;
    }

    return true;
  }

  limpiarMensajes(): void {
    this.mensajeExito = '';
    this.mensajeError = '';
  }
}
