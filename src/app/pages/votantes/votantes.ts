import { DialogosService } from '../../core/services/dialogos.service';
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, combineLatest, firstValueFrom, map, shareReplay } from 'rxjs';

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import { UsuarioSistema } from '../../core/models/usuario-sistema.model';
import { Votante } from '../../core/models/votante.model';

import { UsuariosService } from '../../core/services/usuarios.service';
import { VotantesService } from '../../core/services/votantes.service';

type FormatoExportacion = 'excel' | 'pdf';
type FiltroFacebook = 'todos' | 'con' | 'sin';
type FiltroEstado = 'todos' | 'activos' | 'inactivos';

interface FiltrosVotantes {
  texto: string;
  seccion: string;
  colonia: string;
  facebook: FiltroFacebook;
  estado: FiltroEstado;
  coordinadorUid: string;
  seccionalUid: string;
  enlaceUid: string;
  movilizadorUid: string;
}

interface FormularioEdicionVotante {
  id: string;
  nombreCompleto: string;
  telefono: string;
  direccion: string;
  edad: number | null;
  claveElector: string;
  seccion: number | null;
  municipio: string;
  colonia: string;
  tieneFacebook: boolean;
  usuarioFacebook: string;
  activo: boolean;
}

@Component({
  selector: 'app-votantes',
  imports: [CommonModule, FormsModule],
  templateUrl: './votantes.html',
  styleUrl: './votantes.css',
})
export class Votantes {
  private dialogos = inject(DialogosService);
  private votantesService = inject(VotantesService);
  private usuariosService = inject(UsuariosService);
  private cd = inject(ChangeDetectorRef);

  mostrarListadoVotantes = false;

  editandoVotante = false;
  guardandoEdicion = false;

  formEdicion: FormularioEdicionVotante = this.crearFormularioEdicionVacio();

  filtros: FiltrosVotantes = {
    texto: '',
    seccion: '',
    colonia: '',
    facebook: 'todos',
    estado: 'todos',
    coordinadorUid: '',
    seccionalUid: '',
    enlaceUid: '',
    movilizadorUid: '',
  };

  private filtrosSubject = new BehaviorSubject<FiltrosVotantes>({
    ...this.filtros,
  });

  mensajeExito = '';
  mensajeError = '';

  votantes$ = this.votantesService.obtenerVotantes().pipe(
    shareReplay({
      bufferSize: 1,
      refCount: true,
    }),
  );

  usuarios$ = this.usuariosService.obtenerUsuarios().pipe(
    shareReplay({
      bufferSize: 1,
      refCount: true,
    }),
  );

  votantesFiltrados$ = combineLatest([this.votantes$, this.filtrosSubject, this.usuarios$]).pipe(
    map(([votantes, filtros, usuarios]) => this.filtrarVotantes(votantes, filtros, usuarios)),
    shareReplay({
      bufferSize: 1,
      refCount: true,
    }),
  );

  seccionesDisponibles$ = this.votantes$.pipe(
    map((votantes) => {
      const secciones = votantes
        .map((votante) => votante.seccion)
        .filter((seccion) => seccion && seccion > 0);

      return Array.from(new Set(secciones)).sort((a, b) => a - b);
    }),
  );

  coloniasDisponibles$ = this.votantes$.pipe(
    map((votantes) => {
      const colonias = votantes
        .map((votante) => votante.colonia)
        .filter((colonia) => colonia && colonia.trim() !== '');

      return Array.from(new Set(colonias)).sort((a, b) => a.localeCompare(b));
    }),
  );

  coordinadoresDisponibles$ = this.usuarios$.pipe(
    map((usuarios) =>
      usuarios
        .filter((usuario) => usuario.rol === 'coordinador' && usuario.activo)
        .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    ),
  );

  seccionalesDisponibles$ = combineLatest([this.usuarios$, this.filtrosSubject]).pipe(
    map(([usuarios, filtros]) =>
      usuarios
        .filter(
          (usuario) =>
            usuario.rol === 'seccional' &&
            usuario.activo &&
            filtros.coordinadorUid !== '' &&
            usuario.coordinadorUid === filtros.coordinadorUid,
        )
        .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    ),
  );

  enlacesDisponibles$ = combineLatest([this.usuarios$, this.filtrosSubject]).pipe(
    map(([usuarios, filtros]) =>
      usuarios
        .filter(
          (usuario) =>
            usuario.rol === 'enlace' &&
            usuario.activo &&
            (!filtros.seccionalUid || usuario.seccionalUid === filtros.seccionalUid) &&
            (!filtros.coordinadorUid ||
              usuarios.some(
                (delegado) =>
                  delegado.uid === usuario.seccionalUid &&
                  delegado.coordinadorUid === filtros.coordinadorUid,
              )),
        )
        .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    ),
  );

  movilizadoresDisponibles$ = combineLatest([this.usuarios$, this.filtrosSubject]).pipe(
    map(([usuarios, filtros]) => {
      return usuarios
        .filter(
          (usuario) =>
            usuario.rol === 'movilizador' &&
            usuario.activo &&
            (filtros.enlaceUid
              ? usuario.enlaceUid === filtros.enlaceUid
              : filtros.seccionalUid !== '' && usuario.seccionalUid === filtros.seccionalUid),
        )
        .sort((a, b) => a.nombre.localeCompare(b.nombre));
    }),
  );

  alternarListadoVotantes(): void {
    this.mostrarListadoVotantes = !this.mostrarListadoVotantes;
  }

  actualizarFiltros(): void {
    this.filtrosSubject.next({
      ...this.filtros,
    });
  }

  alCambiarCoordinador(): void {
    this.filtros.seccionalUid = '';
    this.filtros.enlaceUid = '';
    this.filtros.movilizadorUid = '';
    this.actualizarFiltros();
  }

  alCambiarSeccional(): void {
    this.filtros.enlaceUid = '';
    this.filtros.movilizadorUid = '';
    this.actualizarFiltros();
  }

  alCambiarEnlace(): void {
    this.filtros.movilizadorUid = '';
    this.actualizarFiltros();
  }

  limpiarFiltros(): void {
    this.filtros = {
      texto: '',
      seccion: '',
      colonia: '',
      facebook: 'todos',
      estado: 'todos',
      coordinadorUid: '',
      seccionalUid: '',
      enlaceUid: '',
      movilizadorUid: '',
    };

    this.actualizarFiltros();
  }

  hayFiltrosActivos(): boolean {
    return (
      this.filtros.texto.trim() !== '' ||
      this.filtros.seccion !== '' ||
      this.filtros.colonia !== '' ||
      this.filtros.facebook !== 'todos' ||
      this.filtros.estado !== 'todos' ||
      this.filtros.coordinadorUid !== '' ||
      this.filtros.seccionalUid !== '' ||
      this.filtros.enlaceUid !== '' ||
      this.filtros.movilizadorUid !== ''
    );
  }

  filtrarVotantes(
    votantes: Votante[],
    filtros: FiltrosVotantes,
    usuarios: UsuarioSistema[],
  ): Votante[] {
    const texto = filtros.texto.trim().toLowerCase();

    const usuariosDelEnlace = new Set([
      filtros.enlaceUid,
      ...usuarios
        .filter(
          (usuario) => usuario.rol === 'movilizador' && usuario.enlaceUid === filtros.enlaceUid,
        )
        .map((usuario) => usuario.uid),
    ]);

    const seccionalesSeleccionados = usuarios
      .filter(
        (usuario) =>
          usuario.rol === 'seccional' &&
          (filtros.seccionalUid
            ? usuario.uid === filtros.seccionalUid
            : filtros.coordinadorUid !== '' && usuario.coordinadorUid === filtros.coordinadorUid),
      )
      .map((usuario) => usuario.uid);
    const seccionalesUids = new Set(seccionalesSeleccionados);
    const movilizadoresSeleccionados = usuarios
      .filter(
        (usuario) =>
          usuario.rol === 'movilizador' && seccionalesUids.has(usuario.seccionalUid || ''),
      )
      .map((usuario) => usuario.uid);
    const movilizadoresUids = new Set(movilizadoresSeleccionados);

    const capturadoresIncluidos = new Set<string>([
      ...seccionalesSeleccionados,
      ...movilizadoresSeleccionados,
    ]);

    return votantes.filter((votante) => {
      const coincideTexto =
        !texto ||
        (votante.nombreCompleto || '').toLowerCase().includes(texto) ||
        (votante.telefono || '').toLowerCase().includes(texto) ||
        (votante.claveElector || '').toLowerCase().includes(texto) ||
        (votante.colonia || '').toLowerCase().includes(texto) ||
        (votante.municipio || '').toLowerCase().includes(texto) ||
        String(votante.seccion || '').includes(texto) ||
        (votante.capturadoPorNombre || '').toLowerCase().includes(texto) ||
        (votante.usuarioFacebook || '').toLowerCase().includes(texto);

      const coincideSeccion = !filtros.seccion || String(votante.seccion) === filtros.seccion;

      const coincideColonia = !filtros.colonia || votante.colonia === filtros.colonia;

      const coincideFacebook =
        filtros.facebook === 'todos' ||
        (filtros.facebook === 'con' && votante.tieneFacebook) ||
        (filtros.facebook === 'sin' && !votante.tieneFacebook);

      const coincideEstado =
        filtros.estado === 'todos' ||
        (filtros.estado === 'activos' && votante.activo) ||
        (filtros.estado === 'inactivos' && !votante.activo);

      const coincideEstructura = filtros.movilizadorUid
        ? votante.movilizadorUid === filtros.movilizadorUid ||
          votante.capturadoPorUid === filtros.movilizadorUid
        : !filtros.coordinadorUid && !filtros.seccionalUid
          ? true
          : Boolean(
              (votante.seccionalUid && seccionalesUids.has(votante.seccionalUid)) ||
              (votante.movilizadorUid && movilizadoresUids.has(votante.movilizadorUid)) ||
              capturadoresIncluidos.has(votante.capturadoPorUid || ''),
            );

      const coincideEnlace =
        !filtros.enlaceUid ||
        usuariosDelEnlace.has(votante.movilizadorUid || votante.capturadoPorUid || '');

      return (
        coincideTexto &&
        coincideSeccion &&
        coincideColonia &&
        coincideFacebook &&
        coincideEstado &&
        coincideEstructura &&
        coincideEnlace
      );
    });
  }

  abrirEditorVotante(votante: Votante): void {
    this.limpiarMensajes();

    if (!votante.id) {
      this.mensajeError = 'No se encontró el ID del simpatizante.';
      this.cd.detectChanges();
      return;
    }

    this.formEdicion = {
      id: votante.id,
      nombreCompleto: votante.nombreCompleto || '',
      telefono: votante.telefono || '',
      direccion: votante.direccion || '',
      edad: votante.edad || null,
      claveElector: votante.claveElector || votante.id || '',
      seccion: votante.seccion || null,
      municipio: votante.municipio || '',
      colonia: votante.colonia || '',
      tieneFacebook: Boolean(votante.tieneFacebook),
      usuarioFacebook: votante.usuarioFacebook || '',
      activo: votante.activo ?? true,
    };

    this.editandoVotante = true;
    this.cd.detectChanges();

    setTimeout(() => {
      const formulario = document.getElementById('formulario-edicion-votante');

      if (formulario) {
        formulario.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }
    }, 100);
  }

  cancelarEdicionVotante(): void {
    this.editandoVotante = false;
    this.guardandoEdicion = false;
    this.formEdicion = this.crearFormularioEdicionVacio();
    this.cd.detectChanges();
  }

  async guardarEdicionVotante(): Promise<void> {
    this.limpiarMensajes();

    if (!this.validarFormularioEdicion()) {
      this.cd.detectChanges();
      return;
    }

    this.guardandoEdicion = true;
    this.cd.detectChanges();

    try {
      await this.votantesService.actualizarVotante(this.formEdicion.id, {
        nombreCompleto: this.normalizarTexto(this.formEdicion.nombreCompleto),
        telefono: this.normalizarTelefono(this.formEdicion.telefono),
        direccion: this.normalizarTexto(this.formEdicion.direccion),
        edad: Number(this.formEdicion.edad),
        seccion: Number(this.formEdicion.seccion),
        municipio: this.formEdicion.municipio.trim(),
        colonia: this.formEdicion.colonia.trim(),
        tieneFacebook: this.formEdicion.tieneFacebook,
        usuarioFacebook: this.formEdicion.tieneFacebook
          ? this.formEdicion.usuarioFacebook.trim()
          : '',
        activo: this.formEdicion.activo,
      });

      this.mensajeExito = 'Datos del simpatizante actualizados correctamente.';
      this.cancelarEdicionVotante();
    } catch (error) {
      console.error('Error al actualizar simpatizante:', error);
      this.mensajeError = 'No se pudieron actualizar los datos del simpatizante.';
    } finally {
      this.guardandoEdicion = false;
      this.cd.detectChanges();
    }
  }

  private validarFormularioEdicion(): boolean {
    if (!this.formEdicion.id) {
      this.mensajeError = 'No se encontró el ID del simpatizante.';
      return false;
    }

    if (!this.formEdicion.nombreCompleto.trim()) {
      this.mensajeError = 'Captura el nombre completo.';
      return false;
    }

    if (!this.formEdicion.telefono.trim()) {
      this.mensajeError = 'Captura el teléfono.';
      return false;
    }

    const telefono = this.normalizarTelefono(this.formEdicion.telefono);

    if (telefono.length < 10) {
      this.mensajeError = 'El teléfono debe tener al menos 10 dígitos.';
      return false;
    }

    if (!this.formEdicion.direccion.trim()) {
      this.mensajeError = 'Captura la dirección.';
      return false;
    }

    if (!this.formEdicion.edad || Number(this.formEdicion.edad) < 18) {
      this.mensajeError = 'Captura una edad válida mayor o igual a 18.';
      return false;
    }

    if (!this.formEdicion.seccion || Number(this.formEdicion.seccion) <= 0) {
      this.mensajeError = 'Captura una sección válida.';
      return false;
    }

    if (!this.formEdicion.municipio.trim()) {
      this.mensajeError = 'Captura el municipio.';
      return false;
    }

    if (!this.formEdicion.colonia.trim()) {
      this.mensajeError = 'Captura la colonia.';
      return false;
    }

    if (this.formEdicion.tieneFacebook && !this.formEdicion.usuarioFacebook.trim()) {
      this.mensajeError = 'Captura el usuario de Facebook.';
      return false;
    }

    return true;
  }

  private crearFormularioEdicionVacio(): FormularioEdicionVotante {
    return {
      id: '',
      nombreCompleto: '',
      telefono: '',
      direccion: '',
      edad: null,
      claveElector: '',
      seccion: null,
      municipio: '',
      colonia: '',
      tieneFacebook: false,
      usuarioFacebook: '',
      activo: true,
    };
  }

  async eliminarVotante(votante: Votante): Promise<void> {
    this.limpiarMensajes();

    if (!votante.id) {
      this.mensajeError = 'No se encontró el ID del simpatizante.';
      this.cd.detectChanges();
      return;
    }

    const confirmar = (await this.dialogos.confirmar(`¿Seguro que quieres eliminar a ${votante.nombreCompleto}? Esta acción no se puede deshacer.`));

    if (!confirmar) {
      return;
    }

    try {
      await this.votantesService.eliminarVotante(votante.id);

      this.mensajeExito = 'Simpatizante eliminado correctamente.';
    } catch (error) {
      console.error('Error al eliminar simpatizante:', error);
      this.mensajeError = 'No se pudo eliminar el simpatizante.';
    } finally {
      this.cd.detectChanges();
    }
  }

  async exportar(formato: FormatoExportacion): Promise<void> {
    const votantes = await firstValueFrom(this.votantesFiltrados$);

    if (votantes.length === 0) {
      (await this.dialogos.avisar('No hay simpatizantes para exportar.'));
      return;
    }

    if (formato === 'excel') {
      this.exportarExcel(votantes);
      return;
    }

    this.exportarPdf(votantes);
  }

  private exportarExcel(votantes: Votante[]): void {
    const datos = votantes.map((votante) => ({
      'Nombre completo': votante.nombreCompleto,
      Teléfono: votante.telefono,
      Dirección: votante.direccion,
      Edad: votante.edad,
      'Clave de elector': votante.claveElector,
      Sección: votante.seccion,
      Municipio: votante.municipio,
      Colonia: votante.colonia,
      Facebook: votante.tieneFacebook ? votante.usuarioFacebook || '' : '',
      Estado: votante.activo ? 'Activo' : 'Inactivo',
      'Capturado por': votante.capturadoPorNombre || '',
      'Rol capturista': votante.capturadoPorRol || '',
      Sincronización: votante.pendienteSincronizacion ? 'Pendiente' : 'Sincronizado',
      'Fecha registro': this.formatearFecha(votante.fechaRegistro),
      'Fecha registro local': votante.fechaRegistroLocal || '',
    }));

    const hoja = XLSX.utils.json_to_sheet(datos);
    const libro = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(libro, hoja, 'Simpatizantes');

    XLSX.writeFile(libro, this.obtenerNombreArchivo('xlsx'));
  }

  private exportarPdf(votantes: Votante[]): void {
    const documento = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });

    const titulo = this.hayFiltrosActivos()
      ? 'Lista filtrada de simpatizantes'
      : 'Lista general de simpatizantes';

    documento.setFontSize(16);
    documento.text('Promoción al Voto', 14, 15);

    documento.setFontSize(11);
    documento.text(titulo, 14, 23);
    documento.text(`Total de simpatizantes: ${votantes.length}`, 14, 30);
    documento.text(`Generado: ${this.formatearFecha(new Date())}`, 14, 37);

    autoTable(documento, {
      startY: 44,
      head: [
        [
          'Nombre',
          'Teléfono',
          'Edad',
          'Sección',
          'Colonia',
          'Facebook',
          'Estado',
          'Capturado por',
          'Sync',
        ],
      ],
      body: votantes.map((votante) => [
        votante.nombreCompleto,
        votante.telefono,
        String(votante.edad),
        String(votante.seccion),
        votante.colonia,
        votante.tieneFacebook ? votante.usuarioFacebook || '' : '',
        votante.activo ? 'Activo' : 'Inactivo',
        votante.capturadoPorNombre || '',
        votante.pendienteSincronizacion ? 'Pendiente' : 'Sincronizado',
      ]),
      styles: {
        fontSize: 8,
        cellPadding: 2,
      },
      headStyles: {
        fillColor: [31, 41, 55],
      },
    });

    documento.save(this.obtenerNombreArchivo('pdf'));
  }

  async exportarTelefonos(formato: FormatoExportacion): Promise<void> {
    const votantes = await firstValueFrom(this.votantesFiltrados$);

    const telefonos = this.obtenerTelefonosUnicos(votantes);

    if (telefonos.length === 0) {
      (await this.dialogos.avisar('No hay teléfonos para exportar.'));
      return;
    }

    if (formato === 'excel') {
      this.exportarTelefonosExcel(telefonos);
      return;
    }

    this.exportarTelefonosPdf(telefonos);
  }

  private obtenerTelefonosUnicos(votantes: Votante[]): string[] {
    const telefonos = votantes
      .map((votante) => this.normalizarTelefono(votante.telefono))
      .filter((telefono) => telefono !== '');

    return Array.from(new Set(telefonos));
  }

  private obtenerDescripcionFiltroTelefonos(): string {
    if (this.filtros.colonia) {
      return `Colonia filtrada: ${this.filtros.colonia}`;
    }

    if (this.filtros.seccion) {
      return `Sección filtrada: ${this.filtros.seccion}`;
    }

    if (this.filtros.movilizadorUid) {
      return 'Reporte filtrado por movilizador';
    }

    if (this.filtros.seccionalUid) {
      return 'Reporte filtrado por delegado';
    }

    if (this.hayFiltrosActivos()) {
      return 'Reporte filtrado';
    }

    return 'Reporte general';
  }

  private exportarTelefonosExcel(telefonos: string[]): void {
    const descripcionFiltro = this.obtenerDescripcionFiltroTelefonos();

    const datos = [
      ['Promoción al Voto'],
      ['Reporte de teléfonos'],
      [descripcionFiltro],
      [`Total de teléfonos: ${telefonos.length}`],
      [`Generado: ${this.formatearFecha(new Date())}`],
      [],
      ['Teléfono'],
      ...telefonos.map((telefono) => [telefono]),
    ];

    const hoja = XLSX.utils.aoa_to_sheet(datos);
    const libro = XLSX.utils.book_new();

    hoja['!cols'] = [{ wch: 22 }];

    XLSX.utils.book_append_sheet(libro, hoja, 'Telefonos');

    XLSX.writeFile(libro, this.obtenerNombreArchivoTelefonos('xlsx'));
  }

  private exportarTelefonosPdf(telefonos: string[]): void {
    const descripcionFiltro = this.obtenerDescripcionFiltroTelefonos();

    const documento = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    documento.setFontSize(16);
    documento.text('Promoción al Voto', 14, 15);

    documento.setFontSize(11);
    documento.text('Reporte de teléfonos', 14, 23);
    documento.text(descripcionFiltro, 14, 30);
    documento.text(`Total de teléfonos: ${telefonos.length}`, 14, 37);
    documento.text(`Generado: ${this.formatearFecha(new Date())}`, 14, 44);

    autoTable(documento, {
      startY: 52,
      head: [['Teléfono']],
      body: telefonos.map((telefono) => [telefono]),
      styles: {
        fontSize: 10,
        cellPadding: 3,
      },
      headStyles: {
        fillColor: [31, 41, 55],
      },
    });

    documento.save(this.obtenerNombreArchivoTelefonos('pdf'));
  }

  private obtenerNombreArchivo(extension: 'xlsx' | 'pdf'): string {
    const fecha = new Date().toISOString().slice(0, 10);
    const tipo = this.hayFiltrosActivos() ? 'filtrado' : 'general';

    return `promocion-al-voto-votantes-${tipo}-${fecha}.${extension}`;
  }

  private obtenerNombreArchivoTelefonos(extension: 'xlsx' | 'pdf'): string {
    const fecha = new Date().toISOString().slice(0, 10);
    const tipo = this.hayFiltrosActivos() ? 'filtrado' : 'general';

    return `promocion-al-voto-telefonos-${tipo}-${fecha}.${extension}`;
  }

  formatearFecha(fecha: Date | string | null | undefined): string {
    if (!fecha) {
      return '';
    }

    const fechaObjeto = fecha instanceof Date ? fecha : new Date(fecha);

    if (isNaN(fechaObjeto.getTime())) {
      return '';
    }

    return new Intl.DateTimeFormat('es-MX', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(fechaObjeto);
  }

  limpiarMensajes(): void {
    this.mensajeExito = '';
    this.mensajeError = '';
  }

  private normalizarTexto(valor: string): string {
    return String(valor || '')
      .trim()
      .replace(/\s+/g, ' ')
      .toUpperCase();
  }

  private normalizarTelefono(telefono: string): string {
    return String(telefono || '').replace(/\D/g, '');
  }
}
