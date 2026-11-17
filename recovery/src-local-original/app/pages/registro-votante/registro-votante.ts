import {
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom, map, shareReplay } from 'rxjs';

import { ColoniasService } from '../../core/services/colonias.service';
import { IneOcrService } from '../../core/services/ine-ocr.service';
import { VotantesService } from '../../core/services/votantes.service';
import { UsuariosService } from '../../core/services/usuarios.service';

import { NuevoVotante } from '../../core/models/votante.model';
import {
  RolUsuario,
  UsuarioSistema,
} from '../../core/models/usuario-sistema.model';

interface FormularioVotante {
  nombreCompleto: string;
  telefono: string;
  direccion: string;
  edad: number | null;
  claveElector: string;
  seccion: number | null;
  municipio: string;
  colonia: string;
  seccionalUid: string;
  movilizadorUid: string;
  tieneFacebook: boolean;
  usuarioFacebook: string;
}

type EstadoRegistroInePendiente = 'pendiente' | 'procesando' | 'error';

interface RegistroInePendiente {
  id: string;
  imagenBase64: string;
  telefono: string;
  tieneFacebook: boolean;
  usuarioFacebook: string;
  municipio: string;
  fechaLocal: string;
  estado: EstadoRegistroInePendiente;
  error?: string;

  nombreCompleto?: string;
  direccion?: string;
  edad?: number | null;
  claveElector?: string;
  seccion?: number | null;
  colonia?: string;

  capturadoPorUid: string;
  capturadoPorNombre: string;
  capturadoPorRol: string;

  movilizadorUid: string;
  movilizadorNombre: string;
  seccionalUid: string;
  seccionalNombre: string;
  asignadoPorUid: string;
  asignadoPorNombre: string;
}

interface NuevoVotanteConAsignacion extends NuevoVotante {
  registradoSinConexion?: boolean;
  fechaCapturaLocal?: string;
  origenCaptura?: string;
  movilizadorUid?: string;
  movilizadorNombre?: string;
  seccionalUid?: string;
  seccionalNombre?: string;
  asignadoPorUid?: string;
  asignadoPorNombre?: string;
}

interface AsignacionVotante {
  capturadoPorUid: string;
  capturadoPorNombre: string;
  capturadoPorRol: string;
  movilizadorUid: string;
  movilizadorNombre: string;
  seccionalUid: string;
  seccionalNombre: string;
  asignadoPorUid: string;
  asignadoPorNombre: string;
}

@Component({
  selector: 'app-registro-votante',
  imports: [CommonModule, FormsModule],
  templateUrl: './registro-votante.html',
  styleUrl: './registro-votante.css',
})
export class RegistroVotante implements OnInit, OnDestroy {
  private coloniasService = inject(ColoniasService);
  private ineOcrService = inject(IneOcrService);
  private votantesService = inject(VotantesService);
  private usuariosService = inject(UsuariosService);
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
  esMovilizador = this.rolUsuarioActual === 'movilizador';

  private readonly nombreBaseDatos = 'promocion-voto-ine-offline';
  private readonly versionBaseDatos = 1;
  private readonly almacenPendientes = 'inesPendientes';

  mensajeExito = '';
  mensajeError = '';
  guardando = false;

  estaEnLinea = navigator.onLine;

  procesandoINE = false;
  progresoOCR = 0;
  textoOCR = '';

  imagenInePendienteBase64 = '';
  imagenPendienteCorreccionBase64 = '';
  registrosPendientesINE = 0;
  pendientesConErrorINE = 0;
  avisosPendientesINE: string[] = [];
  pendientesINEConError: RegistroInePendiente[] = [];
  pendienteINEEnCorreccionId = '';
  corrigiendoPendienteINE = false;
  procesandoPendientesINE = false;

  colonias$ = this.coloniasService.obtenerColonias().pipe(
    map((colonias) =>
      colonias
        .filter((colonia) => colonia.activo)
        .sort((a, b) => a.nombre.localeCompare(b.nombre))
    ),
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

  seccionalesDisponibles$ = this.usuarios$.pipe(
    map((usuarios) =>
      usuarios
        .filter((usuario) => usuario.rol === 'seccional' && usuario.activo)
        .sort((a, b) => a.nombre.localeCompare(b.nombre))
    )
  );

  movilizadoresDisponibles$ = this.usuarios$.pipe(
    map((usuarios) =>
      usuarios
        .filter((usuario) => {
          if (usuario.rol !== 'movilizador' || !usuario.activo) {
            return false;
          }

          if (this.esCoordinador) {
            return true;
          }

          if (this.esSeccional) {
            return usuario.seccionalUid === this.uidUsuarioActual;
          }

          return false;
        })
        .sort((a, b) => a.nombre.localeCompare(b.nombre))
    )
  );

  formVotante: FormularioVotante = {
    nombreCompleto: '',
    telefono: '',
    direccion: '',
    edad: null,
    claveElector: '',
    seccion: null,
    municipio: 'San Juan Bautista Tuxtepec',
    colonia: '',
    seccionalUid: '',
    movilizadorUid: '',
    tieneFacebook: false,
    usuarioFacebook: '',
  };

  private actualizarEstadoOnline = (): void => {
    this.estaEnLinea = true;
    this.contarPendientesINE();
    this.procesarPendientesINE();
    this.cd.detectChanges();
  };

  private actualizarEstadoOffline = (): void => {
    this.estaEnLinea = false;
    this.cd.detectChanges();
  };

  ngOnInit(): void {
    this.estaEnLinea = navigator.onLine;

    window.addEventListener('online', this.actualizarEstadoOnline);
    window.addEventListener('offline', this.actualizarEstadoOffline);

    this.contarPendientesINE();

    if (navigator.onLine) {
      this.procesarPendientesINE();
    }
  }

  ngOnDestroy(): void {
    window.removeEventListener('online', this.actualizarEstadoOnline);
    window.removeEventListener('offline', this.actualizarEstadoOffline);
  }

  alCambiarSeccion(valor: number | string | null): void {
    const seccion = Number(valor);
    this.formVotante.seccion = seccion > 0 ? seccion : null;
  }

  alCambiarSeccionalRegistro(seccionalUid: string): void {
    this.formVotante.seccionalUid = seccionalUid;
    this.formVotante.movilizadorUid = '';
  }

  filtrarMovilizadoresParaRegistro(
    movilizadores: UsuarioSistema[] | null
  ): UsuarioSistema[] {
    const lista = movilizadores || [];

    if (this.esCoordinador) {
      if (!this.formVotante.seccionalUid) {
        return [];
      }

      return lista.filter(
        (movilizador) =>
          movilizador.seccionalUid === this.formVotante.seccionalUid
      );
    }

    if (this.esSeccional) {
      return lista.filter(
        (movilizador) => movilizador.seccionalUid === this.uidUsuarioActual
      );
    }

    return [];
  }

  async procesarImagenINE(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const archivo = input.files?.[0];

    if (!archivo) {
      return;
    }

    this.limpiarMensajes();
    this.textoOCR = '';

    try {
      const imagenBase64 = await this.convertirImagenABase64(archivo);

      if (!navigator.onLine) {
        this.imagenInePendienteBase64 = imagenBase64;

        this.mensajeExito =
          'Sin internet: la imagen de la INE quedó preparada. Captura teléfono y Facebook, luego presiona guardar.';

        input.value = '';
        this.cd.detectChanges();
        return;
      }

      this.procesandoINE = true;
      this.progresoOCR = 5;
      this.cd.detectChanges();

      this.progresoOCR = 35;
      this.cd.detectChanges();

      const respuesta = await this.ineOcrService.leerIne(imagenBase64);

      this.progresoOCR = 80;
      this.cd.detectChanges();

      const datosINE = respuesta.datos;
      this.textoOCR = respuesta.texto || '';

      let datosDetectados = 0;
      let avisoColonia = '';

      if (datosINE.nombreCompleto) {
        this.formVotante.nombreCompleto = datosINE.nombreCompleto;
        datosDetectados++;
      }

      if (datosINE.direccion) {
        this.formVotante.direccion = datosINE.direccion;
        datosDetectados++;
      }

      if (datosINE.colonia) {
        const coloniaCatalogo = await this.buscarColoniaEnCatalogo(
          datosINE.colonia
        );

        if (coloniaCatalogo) {
          this.formVotante.colonia = coloniaCatalogo;
          datosDetectados++;
        } else {
          this.formVotante.colonia = '';
          avisoColonia = `El OCR detectó la colonia "${datosINE.colonia}", pero no se encontró igual o parecida en tu catálogo. Selecciónala manualmente.`;
        }
      }

      if (datosINE.claveElector) {
        this.formVotante.claveElector = datosINE.claveElector;
        datosDetectados++;
      }

      if (datosINE.seccion) {
        this.formVotante.seccion = datosINE.seccion;
        datosDetectados++;
      }

      if (datosINE.edad) {
        this.formVotante.edad = datosINE.edad;
        datosDetectados++;
      }

      this.progresoOCR = 100;
      this.cd.detectChanges();

      if (datosDetectados > 0) {
        this.mensajeExito =
          'Datos extraídos con OCR. Revisa la información antes de guardar.';
      } else {
        this.mensajeError =
          'La imagen se procesó, pero no se detectaron datos claros. Intenta tomar otra foto con mejor luz y sin reflejo.';
      }

      if (avisoColonia) {
        this.mensajeError = avisoColonia;
      }
    } catch (error: any) {
      console.error('Error completo al procesar INE:', error);

      const codigo = error?.code || 'sin-codigo';
      const mensaje = error?.message || 'sin-mensaje';
      const detalles = error?.details ? JSON.stringify(error.details) : '';

      this.mensajeError = `Error OCR: ${codigo}. ${mensaje} ${detalles}`;
      this.cd.detectChanges();
    } finally {
      this.procesandoINE = false;
      this.progresoOCR = 0;
      input.value = '';
      this.cd.detectChanges();
    }
  }

  private convertirImagenABase64(archivo: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const imagen = new Image();
      const url = URL.createObjectURL(archivo);

      imagen.onload = () => {
        const canvas = document.createElement('canvas');
        const contexto = canvas.getContext('2d');

        if (!contexto) {
          URL.revokeObjectURL(url);
          reject('No se pudo preparar la imagen.');
          return;
        }

        const maxAncho = 1600;
        const maxAlto = 1600;

        let ancho = imagen.width;
        let alto = imagen.height;

        const escala = Math.min(maxAncho / ancho, maxAlto / alto, 1);

        ancho = Math.round(ancho * escala);
        alto = Math.round(alto * escala);

        canvas.width = ancho;
        canvas.height = alto;

        contexto.drawImage(imagen, 0, 0, ancho, alto);

        const base64 = canvas.toDataURL('image/jpeg', 0.82);

        URL.revokeObjectURL(url);

        resolve(base64);
      };

      imagen.onerror = () => {
        URL.revokeObjectURL(url);
        reject('No se pudo cargar la imagen.');
      };

      imagen.src = url;
    });
  }

  async registrarVotante(): Promise<void> {
    this.limpiarMensajes();

    if (this.pendienteINEEnCorreccionId) {
      await this.guardarCorreccionPendienteINE();
      return;
    }

    if (!navigator.onLine && this.imagenInePendienteBase64) {
      await this.guardarRegistroIneSinConexion();
      return;
    }

    if (!this.validarFormulario()) {
      this.cd.detectChanges();
      this.scrollArriba();
      return;
    }

    this.guardando = true;
    this.cd.detectChanges();

    const estabaSinConexion = !navigator.onLine;

    try {
      const votanteParaGuardar = await this.crearVotanteDesdeFormulario();

      await this.votantesService.registrarVotante(votanteParaGuardar);

      this.mensajeExito = estabaSinConexion
        ? 'Registro guardado sin conexión. Se subirá automáticamente cuando el teléfono tenga internet.'
        : 'Registro exitoso. El votante fue guardado correctamente.';

      this.limpiarFormulario();
    } catch (error: any) {
      console.error('Error al registrar votante:', error);

      if (error?.message === 'REGISTRO_REPETIDO') {
        this.mensajeError =
          'Registro repetido. Ya existe un votante con esa clave de elector.';
      } else if (error?.message) {
        this.mensajeError = error.message;
      } else {
        this.mensajeError = 'Registro fallido. No se pudo guardar el votante.';
      }
    } finally {
      this.guardando = false;
      this.cd.detectChanges();
      this.scrollArriba();
    }
  }

  private async guardarRegistroIneSinConexion(): Promise<void> {
    if (!this.validarFormularioPendienteINE()) {
      this.cd.detectChanges();
      this.scrollArriba();
      return;
    }

    this.guardando = true;
    this.cd.detectChanges();

    try {
      const asignacion = await this.obtenerAsignacionVotante();

      const pendiente: RegistroInePendiente = {
        id: this.crearIdPendiente(),
        imagenBase64: this.imagenInePendienteBase64,
        telefono: this.normalizarTelefono(this.formVotante.telefono),
        tieneFacebook: this.formVotante.tieneFacebook,
        usuarioFacebook: this.formVotante.tieneFacebook
          ? this.formVotante.usuarioFacebook.trim()
          : '',
        municipio:
          this.formVotante.municipio.trim() || 'San Juan Bautista Tuxtepec',
        fechaLocal: new Date().toISOString(),
        estado: 'pendiente',

        nombreCompleto: '',
        direccion: '',
        edad: null,
        claveElector: '',
        seccion: null,
        colonia: '',

        capturadoPorUid: asignacion.capturadoPorUid,
        capturadoPorNombre: asignacion.capturadoPorNombre,
        capturadoPorRol: asignacion.capturadoPorRol,

        movilizadorUid: asignacion.movilizadorUid,
        movilizadorNombre: asignacion.movilizadorNombre,
        seccionalUid: asignacion.seccionalUid,
        seccionalNombre: asignacion.seccionalNombre,
        asignadoPorUid: asignacion.asignadoPorUid,
        asignadoPorNombre: asignacion.asignadoPorNombre,
      };

      await this.guardarPendienteEnIndexedDB(pendiente);
      await this.contarPendientesINE();

      this.mensajeExito =
        'Registro guardado sin conexión. Cuando vuelva el internet, se procesará la INE y se subirá el votante.';

      this.limpiarFormulario();
    } catch (error: any) {
      console.error('Error al guardar INE pendiente:', error);

      this.mensajeError =
        error?.message ||
        'No se pudo guardar la INE sin conexión en este dispositivo.';
    } finally {
      this.guardando = false;
      this.cd.detectChanges();
      this.scrollArriba();
    }
  }

  async procesarPendientesINE(): Promise<void> {
    if (!navigator.onLine || this.procesandoPendientesINE) {
      return;
    }

    this.procesandoPendientesINE = true;
    this.cd.detectChanges();

    try {
      const pendientes = await this.obtenerPendientesDeIndexedDB();

      const pendientesProcesables = pendientes.filter(
        (pendiente) =>
          pendiente.estado === 'pendiente' || pendiente.estado === 'procesando'
      );

      for (const pendiente of pendientesProcesables) {
        await this.procesarPendienteINE(pendiente);
      }

      await this.contarPendientesINE();
    } catch (error) {
      console.error('Error al procesar pendientes de INE:', error);
    } finally {
      this.procesandoPendientesINE = false;
      this.cd.detectChanges();
    }
  }

  private async procesarPendienteINE(
    pendiente: RegistroInePendiente
  ): Promise<void> {
    try {
      await this.actualizarPendienteEnIndexedDB({
        ...pendiente,
        estado: 'procesando',
        error: '',
      });

      const respuesta = await this.ineOcrService.leerIne(
        pendiente.imagenBase64
      );

      const datosINE = respuesta.datos;

      const errorDatos = this.validarDatosOCRPendienteBasicos(datosINE);

      if (errorDatos) {
        await this.actualizarPendienteEnIndexedDB({
          ...pendiente,
          ...this.obtenerDatosParcialesINE(datosINE),
          estado: 'error',
          error: errorDatos,
        });

        return;
      }

      const coloniaCatalogo = await this.buscarColoniaEnCatalogo(
        datosINE.colonia
      );

      if (!coloniaCatalogo) {
        await this.actualizarPendienteEnIndexedDB({
          ...pendiente,
          ...this.obtenerDatosParcialesINE(datosINE),
          estado: 'error',
          error: `OCR incompleto: se detectó la colonia "${datosINE.colonia}", pero no coincide con ninguna colonia del catálogo.`,
        });

        return;
      }

      await this.actualizarPendienteEnIndexedDB({
        ...pendiente,
        ...this.obtenerDatosParcialesINE(datosINE),
        colonia: coloniaCatalogo || datosINE.colonia || '',
        estado: 'procesando',
        error: '',
      });

      const votanteParaGuardar: NuevoVotanteConAsignacion = {
        nombreCompleto: this.normalizarTexto(datosINE.nombreCompleto),
        telefono: pendiente.telefono,
        direccion: this.normalizarTexto(datosINE.direccion),
        edad: Number(datosINE.edad),
        claveElector: this.normalizarClaveElector(datosINE.claveElector),
        seccion: Number(datosINE.seccion),
        municipio: pendiente.municipio,
        colonia: coloniaCatalogo,
        tieneFacebook: pendiente.tieneFacebook,
        usuarioFacebook: pendiente.tieneFacebook
          ? pendiente.usuarioFacebook.trim()
          : '',
        activo: true,

        registradoSinConexion: true,
        fechaCapturaLocal: pendiente.fechaLocal,
        origenCaptura: 'ine_offline',

        capturadoPorUid: pendiente.capturadoPorUid,
        capturadoPorNombre: pendiente.capturadoPorNombre,
        capturadoPorRol: pendiente.capturadoPorRol,

        movilizadorUid: pendiente.movilizadorUid || '',
        movilizadorNombre: pendiente.movilizadorNombre || '',
        seccionalUid: pendiente.seccionalUid || '',
        seccionalNombre: pendiente.seccionalNombre || '',
        asignadoPorUid: pendiente.asignadoPorUid || pendiente.capturadoPorUid,
        asignadoPorNombre:
          pendiente.asignadoPorNombre || pendiente.capturadoPorNombre,
      };

      await this.votantesService.registrarVotante(votanteParaGuardar);

      await this.eliminarPendienteDeIndexedDB(pendiente.id);

      this.mensajeExito =
        'Se procesó una INE pendiente y el votante fue guardado correctamente.';
    } catch (error: any) {
      console.error('Error al procesar pendiente INE:', error);

      let mensaje = 'No se pudo procesar este registro pendiente.';

      if (error?.message === 'REGISTRO_REPETIDO') {
        mensaje =
          'Registro repetido. Ya existe un votante con esa clave de elector.';
      } else if (error?.message === 'CLAVE_ELECTOR_INVALIDA') {
        mensaje =
          'No se pudo guardar porque no se detectó una clave de elector válida.';
      } else if (error?.message) {
        mensaje = error.message;
      }

      await this.actualizarPendienteEnIndexedDB({
        ...pendiente,
        estado: 'error',
        error: mensaje,
      });
    }
  }

  private validarDatosOCRPendienteBasicos(datosINE: any): string {
    if (!datosINE) {
      return 'OCR incompleto: no se pudieron leer los datos de la INE.';
    }

    if (!datosINE.nombreCompleto || !String(datosINE.nombreCompleto).trim()) {
      return 'OCR incompleto: no se detectó el nombre completo.';
    }

    if (!datosINE.direccion || !String(datosINE.direccion).trim()) {
      return 'OCR incompleto: no se detectó la dirección.';
    }

    if (!datosINE.claveElector || !String(datosINE.claveElector).trim()) {
      return 'OCR incompleto: no se detectó la clave de elector.';
    }

    if (!datosINE.seccion || Number(datosINE.seccion) <= 0) {
      return 'OCR incompleto: no se detectó la sección electoral.';
    }

    if (!datosINE.edad || Number(datosINE.edad) < 18) {
      return 'OCR incompleto: no se detectó una edad válida.';
    }

    if (!datosINE.colonia || !String(datosINE.colonia).trim()) {
      return 'OCR incompleto: no se detectó la colonia, fraccionamiento, barrio o ejido.';
    }

    return '';
  }

  validarFormulario(): boolean {
    if (!this.formVotante.nombreCompleto.trim()) {
      this.mensajeError = 'Captura el nombre completo.';
      return false;
    }

    if (!this.validarTelefono()) {
      return false;
    }

    if (!this.formVotante.direccion.trim()) {
      this.mensajeError = 'Captura la dirección.';
      return false;
    }

    if (!this.formVotante.edad || Number(this.formVotante.edad) < 18) {
      this.mensajeError = 'Captura una edad válida mayor o igual a 18.';
      return false;
    }

    if (!this.formVotante.claveElector.trim()) {
      this.mensajeError = 'Captura la clave de elector.';
      return false;
    }

    if (!this.formVotante.seccion || Number(this.formVotante.seccion) <= 0) {
      this.mensajeError = 'Captura una sección válida.';
      return false;
    }

    if (!this.formVotante.municipio.trim()) {
      this.mensajeError = 'Captura el municipio.';
      return false;
    }

    if (!this.formVotante.colonia.trim()) {
      this.mensajeError = 'Selecciona la colonia.';
      return false;
    }

    if (!this.validarAsignacionRegistro()) {
      return false;
    }

    if (
      this.formVotante.tieneFacebook &&
      !this.formVotante.usuarioFacebook.trim()
    ) {
      this.mensajeError = 'Captura el usuario de Facebook.';
      return false;
    }

    return true;
  }

  private validarFormularioPendienteINE(): boolean {
    if (!this.imagenInePendienteBase64) {
      this.mensajeError =
        'Primero toma o selecciona la foto de la INE para guardarla sin conexión.';
      return false;
    }

    if (!this.validarTelefono()) {
      return false;
    }

    if (!this.validarAsignacionRegistro()) {
      return false;
    }

    if (
      this.formVotante.tieneFacebook &&
      !this.formVotante.usuarioFacebook.trim()
    ) {
      this.mensajeError = 'Captura el usuario de Facebook.';
      return false;
    }

    return true;
  }

  private validarAsignacionRegistro(): boolean {
    if (this.esCoordinador) {
      if (this.formVotante.seccionalUid && !this.formVotante.movilizadorUid) {
        this.mensajeError = 'Selecciona el movilizador del seccional elegido.';
        return false;
      }

      if (!this.formVotante.seccionalUid && this.formVotante.movilizadorUid) {
        this.mensajeError = 'Primero selecciona el seccional responsable.';
        return false;
      }
    }

    if (this.esSeccional && !this.formVotante.movilizadorUid) {
      this.mensajeError =
        'Selecciona el movilizador al que pertenecerá este votante.';
      return false;
    }

    return true;
  }

  private validarTelefono(): boolean {
    if (!this.formVotante.telefono.trim()) {
      this.mensajeError = 'Captura el número de teléfono.';
      return false;
    }

    const telefono = this.normalizarTelefono(this.formVotante.telefono);

    if (telefono.length < 10) {
      this.mensajeError = 'El teléfono debe tener al menos 10 dígitos.';
      return false;
    }

    return true;
  }

  private async crearVotanteDesdeFormulario(): Promise<NuevoVotanteConAsignacion> {
    const telefonoNormalizado = this.normalizarTelefono(
      this.formVotante.telefono
    );

    const claveElectorNormalizada = this.normalizarClaveElector(
      this.formVotante.claveElector
    );

    const asignacion = await this.obtenerAsignacionVotante();

    return {
      nombreCompleto: this.normalizarTexto(this.formVotante.nombreCompleto),
      telefono: telefonoNormalizado,
      direccion: this.normalizarTexto(this.formVotante.direccion),
      edad: Number(this.formVotante.edad),
      claveElector: claveElectorNormalizada,
      seccion: Number(this.formVotante.seccion),
      municipio: this.formVotante.municipio.trim(),
      colonia: this.formVotante.colonia.trim(),
      tieneFacebook: this.formVotante.tieneFacebook,
      usuarioFacebook: this.formVotante.tieneFacebook
        ? this.formVotante.usuarioFacebook.trim()
        : '',
      activo: true,

      capturadoPorUid: asignacion.capturadoPorUid,
      capturadoPorNombre: asignacion.capturadoPorNombre,
      capturadoPorRol: asignacion.capturadoPorRol,

      movilizadorUid: asignacion.movilizadorUid,
      movilizadorNombre: asignacion.movilizadorNombre,
      seccionalUid: asignacion.seccionalUid,
      seccionalNombre: asignacion.seccionalNombre,
      asignadoPorUid: asignacion.asignadoPorUid,
      asignadoPorNombre: asignacion.asignadoPorNombre,
    };
  }

  private async obtenerAsignacionVotante(): Promise<AsignacionVotante> {
    const datosCapturador = this.obtenerDatosCapturador();
    const usuarios = await firstValueFrom(this.usuarios$);

    if (this.esCoordinador && this.formVotante.seccionalUid) {
      const seccional = usuarios.find(
        (usuario) =>
          usuario.uid === this.formVotante.seccionalUid &&
          usuario.rol === 'seccional' &&
          usuario.activo
      );

      if (!seccional) {
        throw new Error('Selecciona un seccional válido.');
      }

      const movilizador = usuarios.find(
        (usuario) =>
          usuario.uid === this.formVotante.movilizadorUid &&
          usuario.rol === 'movilizador' &&
          usuario.activo &&
          usuario.seccionalUid === seccional.uid
      );

      if (!movilizador) {
        throw new Error('Selecciona un movilizador válido para ese seccional.');
      }

      return {
        capturadoPorUid: movilizador.uid,
        capturadoPorNombre: movilizador.nombre,
        capturadoPorRol: 'movilizador',
        movilizadorUid: movilizador.uid,
        movilizadorNombre: movilizador.nombre,
        seccionalUid: seccional.uid,
        seccionalNombre: seccional.nombre,
        asignadoPorUid: datosCapturador.uidUsuario,
        asignadoPorNombre: datosCapturador.nombreUsuario,
      };
    }

    if (this.esSeccional) {
      const movilizador = usuarios.find(
        (usuario) =>
          usuario.uid === this.formVotante.movilizadorUid &&
          usuario.rol === 'movilizador' &&
          usuario.activo &&
          usuario.seccionalUid === datosCapturador.uidUsuario
      );

      if (!movilizador) {
        throw new Error('Selecciona un movilizador válido para este seccional.');
      }

      return {
        capturadoPorUid: movilizador.uid,
        capturadoPorNombre: movilizador.nombre,
        capturadoPorRol: 'movilizador',
        movilizadorUid: movilizador.uid,
        movilizadorNombre: movilizador.nombre,
        seccionalUid: datosCapturador.uidUsuario,
        seccionalNombre: datosCapturador.nombreUsuario,
        asignadoPorUid: datosCapturador.uidUsuario,
        asignadoPorNombre: datosCapturador.nombreUsuario,
      };
    }

    if (this.esMovilizador) {
      const perfilMovilizador = usuarios.find(
        (usuario) => usuario.uid === datosCapturador.uidUsuario
      );

      return {
        capturadoPorUid: datosCapturador.uidUsuario,
        capturadoPorNombre: datosCapturador.nombreUsuario,
        capturadoPorRol: 'movilizador',
        movilizadorUid: datosCapturador.uidUsuario,
        movilizadorNombre: datosCapturador.nombreUsuario,
        seccionalUid: perfilMovilizador?.seccionalUid || '',
        seccionalNombre: perfilMovilizador?.seccionalNombre || '',
        asignadoPorUid: datosCapturador.uidUsuario,
        asignadoPorNombre: datosCapturador.nombreUsuario,
      };
    }

    return {
      capturadoPorUid: datosCapturador.uidUsuario,
      capturadoPorNombre: datosCapturador.nombreUsuario,
      capturadoPorRol: datosCapturador.rolUsuario,
      movilizadorUid: '',
      movilizadorNombre: '',
      seccionalUid: '',
      seccionalNombre: '',
      asignadoPorUid: datosCapturador.uidUsuario,
      asignadoPorNombre: datosCapturador.nombreUsuario,
    };
  }

  private obtenerDatosCapturador(): {
    uidUsuario: string;
    nombreUsuario: string;
    rolUsuario: string;
  } {
    const uidUsuario =
      localStorage.getItem('uidUsuario') ||
      localStorage.getItem('usuarioUid') ||
      localStorage.getItem('uid') ||
      '';

    const nombreUsuario =
      localStorage.getItem('nombreUsuario') ||
      localStorage.getItem('usuarioNombre') ||
      '';

    const rolUsuario = localStorage.getItem('rolUsuario') || '';

    return {
      uidUsuario,
      nombreUsuario,
      rolUsuario,
    };
  }

  async contarPendientesINE(): Promise<void> {
    try {
      const pendientes = await this.obtenerPendientesDeIndexedDB();

      this.registrosPendientesINE = pendientes.length;

      const pendientesConError = pendientes.filter(
        (pendiente) => pendiente.estado === 'error'
      );

      this.pendientesINEConError = pendientesConError;
      this.pendientesConErrorINE = pendientesConError.length;

      this.avisosPendientesINE = pendientesConError.map((pendiente, index) => {
        const telefono = pendiente.telefono
          ? `Tel. ${pendiente.telefono}`
          : 'Sin teléfono';

        const fecha = pendiente.fechaLocal
          ? new Date(pendiente.fechaLocal).toLocaleString('es-MX')
          : 'Sin fecha';

        return `${index + 1}. ${telefono} - ${fecha}: ${
          pendiente.error || 'No se pudo procesar este registro.'
        }`;
      });

      this.cd.detectChanges();
    } catch (error) {
      console.error('Error al contar pendientes INE:', error);
    }
  }

  async reintentarPendientesConError(): Promise<void> {
    const pendientes = await this.obtenerPendientesDeIndexedDB();

    const pendientesActualizados = pendientes.map((pendiente) =>
      pendiente.estado === 'error'
        ? {
            ...pendiente,
            estado: 'pendiente' as EstadoRegistroInePendiente,
            error: '',
          }
        : pendiente
    );

    for (const pendiente of pendientesActualizados) {
      await this.actualizarPendienteEnIndexedDB(pendiente);
    }

    await this.contarPendientesINE();

    if (navigator.onLine) {
      await this.procesarPendientesINE();
    }
  }

  async cargarPendienteINEParaCorregir(
    pendiente: RegistroInePendiente
  ): Promise<void> {
    this.limpiarMensajes();

    if (!navigator.onLine) {
      this.mensajeError =
        'Necesitas internet para corregir y guardar este pendiente en Firebase.';
      this.scrollArriba();
      this.cd.detectChanges();
      return;
    }

    this.pendienteINEEnCorreccionId = pendiente.id;
    this.corrigiendoPendienteINE = true;
    this.imagenInePendienteBase64 = '';
    this.imagenPendienteCorreccionBase64 = pendiente.imagenBase64 || '';
    this.textoOCR = '';

    this.formVotante = {
      nombreCompleto: pendiente.nombreCompleto || '',
      telefono: pendiente.telefono || '',
      direccion: pendiente.direccion || '',
      edad: pendiente.edad ? Number(pendiente.edad) : null,
      claveElector: pendiente.claveElector || '',
      seccion: pendiente.seccion ? Number(pendiente.seccion) : null,
      municipio: pendiente.municipio || 'San Juan Bautista Tuxtepec',
      colonia: pendiente.colonia || '',
      seccionalUid: pendiente.seccionalUid || '',
      movilizadorUid: pendiente.movilizadorUid || '',
      tieneFacebook: pendiente.tieneFacebook || false,
      usuarioFacebook: pendiente.usuarioFacebook || '',
    };

    this.mensajeExito =
      'Pendiente cargado para corrección. Completa o corrige los datos y presiona guardar.';

    this.scrollArriba();
    this.cd.detectChanges();
  }

  abrirImagenPendienteINE(): void {
    if (!this.imagenPendienteCorreccionBase64) {
      this.mensajeError = 'No hay imagen de INE disponible para este pendiente.';
      this.cd.detectChanges();
      return;
    }

    const ventana = window.open('', '_blank');

    if (!ventana) {
      this.mensajeError =
        'No se pudo abrir la imagen. Revisa si el navegador bloqueó la ventana emergente.';
      this.cd.detectChanges();
      return;
    }

    ventana.document.write(`
      <html>
        <head>
          <title>INE pendiente</title>
          <style>
            body {
              margin: 0;
              padding: 16px;
              background: #111827;
              display: flex;
              justify-content: center;
              align-items: flex-start;
            }

            img {
              max-width: 100%;
              height: auto;
              border-radius: 12px;
              background: white;
            }
          </style>
        </head>
        <body>
          <img src="${this.imagenPendienteCorreccionBase64}" alt="INE pendiente" />
        </body>
      </html>
    `);

    ventana.document.close();
  }

  cancelarCorreccionPendienteINE(): void {
    this.pendienteINEEnCorreccionId = '';
    this.corrigiendoPendienteINE = false;
    this.limpiarFormulario();
    this.mensajeExito = 'Corrección cancelada.';
    this.scrollArriba();
    this.cd.detectChanges();
  }

  async eliminarPendienteINE(pendiente: RegistroInePendiente): Promise<void> {
    const confirmar = window.confirm(
      '¿Seguro que quieres eliminar este pendiente? Esta acción no se puede deshacer.'
    );

    if (!confirmar) {
      return;
    }

    try {
      await this.eliminarPendienteDeIndexedDB(pendiente.id);
      await this.contarPendientesINE();

      this.mensajeExito = 'Pendiente eliminado correctamente.';
    } catch (error) {
      console.error('Error al eliminar pendiente:', error);
      this.mensajeError = 'No se pudo eliminar el pendiente.';
    } finally {
      this.cd.detectChanges();
      this.scrollArriba();
    }
  }

  private async guardarCorreccionPendienteINE(): Promise<void> {
    if (!navigator.onLine) {
      this.mensajeError =
        'Necesitas internet para guardar la corrección del pendiente.';
      this.cd.detectChanges();
      this.scrollArriba();
      return;
    }

    if (!this.validarFormulario()) {
      this.cd.detectChanges();
      this.scrollArriba();
      return;
    }

    this.guardando = true;
    this.cd.detectChanges();

    try {
      const pendientes = await this.obtenerPendientesDeIndexedDB();

      const pendiente = pendientes.find(
        (item) => item.id === this.pendienteINEEnCorreccionId
      );

      if (!pendiente) {
        throw new Error('No se encontró el pendiente a corregir.');
      }

      const votanteParaGuardar = await this.crearVotanteDesdeFormulario();

      const votanteCorregido: NuevoVotanteConAsignacion = {
        ...votanteParaGuardar,
        registradoSinConexion: true,
        fechaCapturaLocal: pendiente.fechaLocal,
        origenCaptura: 'ine_offline_correccion_manual',
      };

      await this.votantesService.registrarVotante(votanteCorregido);

      await this.eliminarPendienteDeIndexedDB(pendiente.id);
      await this.contarPendientesINE();

      this.mensajeExito =
        'Pendiente corregido y guardado correctamente en el sistema.';

      this.pendienteINEEnCorreccionId = '';
      this.corrigiendoPendienteINE = false;
      this.limpiarFormulario();
    } catch (error: any) {
      console.error('Error al guardar corrección de pendiente:', error);

      if (error?.message === 'REGISTRO_REPETIDO') {
        this.mensajeError =
          'Registro repetido. Ya existe un votante con esa clave de elector.';
      } else if (error?.message) {
        this.mensajeError = error.message;
      } else {
        this.mensajeError = 'No se pudo guardar la corrección del pendiente.';
      }
    } finally {
      this.guardando = false;
      this.cd.detectChanges();
      this.scrollArriba();
    }
  }

  private obtenerDatosParcialesINE(datosINE: any): Partial<RegistroInePendiente> {
    if (!datosINE) {
      return {};
    }

    return {
      nombreCompleto: datosINE.nombreCompleto || '',
      direccion: datosINE.direccion || '',
      edad: datosINE.edad ? Number(datosINE.edad) : null,
      claveElector: datosINE.claveElector || '',
      seccion: datosINE.seccion ? Number(datosINE.seccion) : null,
      colonia: datosINE.colonia || '',
    };
  }

  limpiarFormulario(): void {
    this.formVotante = {
      nombreCompleto: '',
      telefono: '',
      direccion: '',
      edad: null,
      claveElector: '',
      seccion: null,
      municipio: 'San Juan Bautista Tuxtepec',
      colonia: '',
      seccionalUid: '',
      movilizadorUid: '',
      tieneFacebook: false,
      usuarioFacebook: '',
    };

    this.textoOCR = '';
    this.imagenInePendienteBase64 = '';
    this.imagenPendienteCorreccionBase64 = '';
    this.pendienteINEEnCorreccionId = '';
    this.corrigiendoPendienteINE = false;
  }

  limpiarMensajes(): void {
    this.mensajeExito = '';
    this.mensajeError = '';
  }

  private async buscarColoniaEnCatalogo(coloniaOCR: string): Promise<string> {
    const textoOCR = this.normalizarColoniaParaComparar(coloniaOCR);

    if (!textoOCR) {
      return '';
    }

    const colonias = await firstValueFrom(this.colonias$);

    const coloniasConComparacion = colonias.map((colonia) => {
      const nombreOriginal = String(colonia.nombre || '');
      const textoCatalogo = this.normalizarColoniaParaComparar(nombreOriginal);

      return {
        nombreOriginal,
        textoCatalogo,
        puntajePalabras: this.calcularPuntajeCoincidencia(
          textoOCR,
          textoCatalogo
        ),
        puntajeLevenshtein: this.calcularSimilitudLevenshtein(
          textoOCR,
          textoCatalogo
        ),
      };
    });

    const coincidenciaExacta = coloniasConComparacion.find(
      (colonia) => colonia.textoCatalogo === textoOCR
    );

    if (coincidenciaExacta) {
      return coincidenciaExacta.nombreOriginal;
    }

    const coincidenciaContenida = coloniasConComparacion.find(
      (colonia) =>
        colonia.textoCatalogo.includes(textoOCR) ||
        textoOCR.includes(colonia.textoCatalogo)
    );

    if (coincidenciaContenida) {
      return coincidenciaContenida.nombreOriginal;
    }

    const mejorCoincidencia = coloniasConComparacion
      .map((colonia) => ({
        ...colonia,
        puntaje: Math.max(
          colonia.puntajePalabras,
          colonia.puntajeLevenshtein
        ),
      }))
      .sort((a, b) => b.puntaje - a.puntaje)[0];

    if (mejorCoincidencia && mejorCoincidencia.puntaje >= 0.72) {
      return mejorCoincidencia.nombreOriginal;
    }

    return '';
  }

  private normalizarColoniaParaComparar(valor: string): string {
    return String(valor || '')
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[.,#\-_/]/g, ' ')
      .replace(/\bCOLONIA\b/g, '')
      .replace(/\bCOLL\b/g, '')
      .replace(/\bCOL\b/g, '')
      .replace(/\bFRACCIONAMIENTO\b/g, '')
      .replace(/\bFRACC\b/g, '')
      .replace(/\bFRAC\b/g, '')
      .replace(/\bUNIDAD\s+HABITACIONAL\b/g, '')
      .replace(/\bUNIDAD\b/g, '')
      .replace(/\bUNID\b/g, '')
      .replace(/\bU\s*H\b/g, '')
      .replace(/\bUH\b/g, '')
      .replace(/\bCONJUNTO\s+HABITACIONAL\b/g, '')
      .replace(/\bCONJUNTO\b/g, '')
      .replace(/\bCONJ\b/g, '')
      .replace(/\bPUEBLO\b/g, '')
      .replace(/\bPUEB\b/g, '')
      .replace(/\bEJIDO\b/g, '')
      .replace(/\bEJID\b/g, '')
      .replace(/\bRANCHERIA\b/g, '')
      .replace(/\bRANCHO\b/g, '')
      .replace(/\bRANC\b/g, '')
      .replace(/\bBARRIO\b/g, '')
      .replace(/\bBARR\b/g, '')
      .replace(/\bBO\b/g, '')
      .replace(/\bPARQUE\b/g, '')
      .replace(/\bPARQ\b/g, '')
      .replace(/\bRESIDENCIAL\b/g, '')
      .replace(/\bRESID\b/g, '')
      .replace(/\bRES\b/g, '')
      .replace(/\bVIVIENDA\b/g, '')
      .replace(/\bVIV\b/g, '')
      .replace(/\bAMPLIACION\b/g, '')
      .replace(/\bAMPL\b/g, '')
      .replace(/\bAMP\b/g, '')
      .replace(/\bSECTOR\b/g, '')
      .replace(/\bSECT\b/g, '')
      .replace(/\bLOCALIDAD\b/g, '')
      .replace(/\bLOC\b/g, '')
      .replace(/\bSAN\s+JUAN\s+BAUTISTA\s+TUXTEPEC\b/g, '')
      .replace(/\bTUXTEPEC\b/g, '')
      .replace(/\bOAXACA\b/g, '')
      .replace(/\bOAX\b/g, '')
      .replace(/\bMEXICO\b/g, '')
      .replace(/\bMEX\b/g, '')
      .replace(/\bCP\b/g, '')
      .replace(/\bC\s*P\b/g, '')
      .replace(/\b\d{5}\b/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private calcularPuntajeCoincidencia(textoA: string, textoB: string): number {
    const palabrasA = textoA
      .split(' ')
      .filter((palabra) => palabra.length > 1);

    const palabrasB = textoB
      .split(' ')
      .filter((palabra) => palabra.length > 1);

    if (palabrasA.length === 0 || palabrasB.length === 0) {
      return 0;
    }

    const setA = new Set(palabrasA);
    const setB = new Set(palabrasB);

    let coincidencias = 0;

    setA.forEach((palabra) => {
      if (setB.has(palabra)) {
        coincidencias++;
      }
    });

    return (2 * coincidencias) / (setA.size + setB.size);
  }

  private calcularSimilitudLevenshtein(textoA: string, textoB: string): number {
    if (!textoA || !textoB) {
      return 0;
    }

    const distancia = this.calcularDistanciaLevenshtein(textoA, textoB);
    const longitudMaxima = Math.max(textoA.length, textoB.length);

    if (longitudMaxima === 0) {
      return 1;
    }

    return 1 - distancia / longitudMaxima;
  }

  private calcularDistanciaLevenshtein(textoA: string, textoB: string): number {
    const matriz: number[][] = [];

    for (let i = 0; i <= textoB.length; i++) {
      matriz[i] = [i];
    }

    for (let j = 0; j <= textoA.length; j++) {
      matriz[0][j] = j;
    }

    for (let i = 1; i <= textoB.length; i++) {
      for (let j = 1; j <= textoA.length; j++) {
        if (textoB.charAt(i - 1) === textoA.charAt(j - 1)) {
          matriz[i][j] = matriz[i - 1][j - 1];
        } else {
          matriz[i][j] = Math.min(
            matriz[i - 1][j - 1] + 1,
            matriz[i][j - 1] + 1,
            matriz[i - 1][j] + 1
          );
        }
      }
    }

    return matriz[textoB.length][textoA.length];
  }

  private normalizarTexto(valor: string): string {
    return String(valor || '').trim().replace(/\s+/g, ' ').toUpperCase();
  }

  private normalizarTelefono(telefono: string): string {
    return String(telefono || '').replace(/\D/g, '');
  }

  private normalizarClaveElector(claveElector: string): string {
    return String(claveElector || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '');
  }

  private crearIdPendiente(): string {
    return `ine-pendiente-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;
  }

  private abrirBaseDatos(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const solicitud = indexedDB.open(
        this.nombreBaseDatos,
        this.versionBaseDatos
      );

      solicitud.onupgradeneeded = () => {
        const db = solicitud.result;

        if (!db.objectStoreNames.contains(this.almacenPendientes)) {
          db.createObjectStore(this.almacenPendientes, {
            keyPath: 'id',
          });
        }
      };

      solicitud.onsuccess = () => resolve(solicitud.result);
      solicitud.onerror = () => reject(solicitud.error);
    });
  }

  private async guardarPendienteEnIndexedDB(
    pendiente: RegistroInePendiente
  ): Promise<void> {
    const db = await this.abrirBaseDatos();

    return new Promise((resolve, reject) => {
      const transaccion = db.transaction(this.almacenPendientes, 'readwrite');
      const almacen = transaccion.objectStore(this.almacenPendientes);

      almacen.put(pendiente);

      transaccion.oncomplete = () => {
        db.close();
        resolve();
      };

      transaccion.onerror = () => {
        db.close();
        reject(transaccion.error);
      };
    });
  }

  private async actualizarPendienteEnIndexedDB(
    pendiente: RegistroInePendiente
  ): Promise<void> {
    await this.guardarPendienteEnIndexedDB(pendiente);
  }

  private async obtenerPendientesDeIndexedDB(): Promise<
    RegistroInePendiente[]
  > {
    const db = await this.abrirBaseDatos();

    return new Promise((resolve, reject) => {
      const transaccion = db.transaction(this.almacenPendientes, 'readonly');
      const almacen = transaccion.objectStore(this.almacenPendientes);
      const solicitud = almacen.getAll();

      solicitud.onsuccess = () => {
        db.close();
        resolve((solicitud.result || []) as RegistroInePendiente[]);
      };

      solicitud.onerror = () => {
        db.close();
        reject(solicitud.error);
      };
    });
  }

  private async eliminarPendienteDeIndexedDB(id: string): Promise<void> {
    const db = await this.abrirBaseDatos();

    return new Promise((resolve, reject) => {
      const transaccion = db.transaction(this.almacenPendientes, 'readwrite');
      const almacen = transaccion.objectStore(this.almacenPendientes);

      almacen.delete(id);

      transaccion.oncomplete = () => {
        db.close();
        resolve();
      };

      transaccion.onerror = () => {
        db.close();
        reject(transaccion.error);
      };
    });
  }

  private scrollArriba(): void {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  }
}