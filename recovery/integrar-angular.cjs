const fs = require('node:fs');
const ts = require('typescript');
function read(file) { return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'); }
function write(file, value) { fs.writeFileSync(file, value); }
function replace(text, before, after) {
  before = before.replace(/\r\n/g, '\n');
  after = after.replace(/\r\n/g, '\n');
  if (!text.includes(before)) throw new Error('No se encontró: ' + before.slice(0, 90));
  return text.replace(before, after);
}
function method(text, name, content) {
  const ast = ts.createSourceFile('source.ts', text, ts.ScriptTarget.Latest, true);
  const cls = ast.statements.find(ts.isClassDeclaration);
  const member = cls.members.find((member) => member.name?.getText(ast) === name);
  if (!member) throw new Error('Método no encontrado: ' + name);
  return text.slice(0, member.getStart(ast)) + content.trim() + text.slice(member.end);
}
let file = 'src/app/pages/estructura/estructura.ts';
let text = read(file);
text = replace(text, "import { combineLatest, firstValueFrom, map, shareReplay } from 'rxjs';", "import { combineLatest, firstValueFrom, map, shareReplay, of, startWith, switchMap } from 'rxjs';");
text = replace(text, "type TabEstructura", "import { JerarquiaService } from '../../core/services/jerarquia.service';\nimport { Jerarquia } from '../../shared/components/jerarquia/jerarquia';\nimport { NOMBRES_ROL } from '../../core/models/usuario-sistema.model';\n\ntype TabEstructura");
text = replace(text, 'imports: [CommonModule, FormsModule]', 'imports: [CommonModule, FormsModule, Jerarquia]');
text = replace(text, '  private cd = inject(ChangeDetectorRef);', `  private cd = inject(ChangeDetectorRef);
  private jerarquiaService = inject(JerarquiaService);
  nombresRol = NOMBRES_ROL;
  passwordUsuario = '';
  passwordMovilizador = '';
  guardandoUsuario = false;
  guardandoMovilizador = false;
  recuperandoUid = new URLSearchParams(location.search).has('recuperarUid');`);
text = replace(text, "  esSeccional = this.rolUsuarioActual === 'seccional';", "  esSeccional = this.rolUsuarioActual === 'seccional';\n  esEnlace = this.rolUsuarioActual === 'enlace';");
text = text.replace(/jerarquia: this\.esSeccional,/g, 'jerarquia: this.esSeccional || this.esEnlace,');
text = replace(text, "tabActivo: TabEstructura = this.esSeccional ? 'jerarquia' : 'secciones';", "tabActivo: TabEstructura = this.esSeccional || this.esEnlace ? 'jerarquia' : 'secciones';");
text = replace(text, 'usuarios$ = this.usuariosService.obtenerUsuarios().pipe(', `usuarios$ = (this.esEnlace
    ? this.jerarquiaService.cambios$.pipe(startWith(undefined), switchMap(() => this.jerarquiaService.listar()), map((datos) => datos.usuarios))
    : this.usuariosService.obtenerUsuarios()).pipe(`);
text = replace(text, 'votantes$ = this.votantesService.obtenerVotantes().pipe(', 'votantes$ = (this.esEnlace ? of<Votante[]>([]) : this.votantesService.obtenerVotantes()).pipe(');
text = replace(text, '  jerarquia$ = combineLatest', `  enlaces$ = this.usuarios$.pipe(map((usuarios) => usuarios
    .filter((usuario) => usuario.rol === 'enlace' && usuario.activo)
    .sort((a, b) => a.nombre.localeCompare(b.nombre))));

  jerarquia$ = combineLatest`);
text = method(text, 'puedeVerPanel', `puedeVerPanel(panel: TabEstructura): boolean {
    return this.esCoordinador || ((this.esSeccional || this.esEnlace) && panel === 'jerarquia');
  }`);
text = method(text, 'guardarUsuario', `async guardarUsuario(): Promise<void> {
    if (this.guardandoUsuario) return;
    this.limpiarMensajes();
    const usuario = this.formUsuario;
    const responsableUid = usuario.rol === 'enlace' ? usuario.seccionalUid : usuario.enlaceUid;
    if (!this.esCoordinador) this.mensajeError = 'Solo el coordinador puede administrar usuarios.';
    else if (!usuario.nombre.trim() || !usuario.correo.trim()) this.mensajeError = 'Captura el nombre y correo del usuario.';
    else if (usuario.rol === 'seccional' && !usuario.coordinadorUid) this.mensajeError = 'Selecciona el coordinador responsable.';
    else if ((usuario.rol === 'enlace' || usuario.rol === 'movilizador') && !responsableUid) this.mensajeError = usuario.rol === 'enlace' ? 'Selecciona el delegado responsable.' : 'Selecciona el enlace responsable.';
    else if (!usuario.uid && this.passwordUsuario.length < 6) this.mensajeError = 'La contraseña debe tener al menos 6 caracteres.';
    if (this.mensajeError) { this.cd.detectChanges(); return; }
    this.guardandoUsuario = true;
    try {
      if (!usuario.uid) {
        usuario.uid = await this.jerarquiaService.crearCuenta(usuario.correo, this.passwordUsuario);
        this.passwordUsuario = '';
      }
      if (usuario.rol === 'enlace' || usuario.rol === 'movilizador') {
        await this.jerarquiaService.guardar(usuario, responsableUid!);
      } else {
        const usuarios = await firstValueFrom(this.usuarios$);
        const coordinador = usuarios.find((item) => item.uid === usuario.coordinadorUid);
        await this.usuariosService.guardarUsuario({
          ...usuario, nombre: usuario.nombre.trim(), correo: usuario.correo.trim(),
          coordinadorUid: usuario.rol === 'seccional' ? usuario.coordinadorUid || '' : '',
          coordinadorNombre: usuario.rol === 'seccional' ? coordinador?.nombre || '' : '',
          seccionalUid: '', seccionalNombre: '', delegadoUid: '', delegadoNombre: '', enlaceUid: '', enlaceNombre: '',
        });
        this.jerarquiaService.notificarCambios();
      }
      this.mensajeExito = this.editandoUsuarioId ? 'Usuario actualizado correctamente.' : 'Cuenta y perfil de usuario guardados correctamente.';
      this.limpiarFormularioUsuario();
      this.abrirPanel('usuarios');
    } catch (error) {
      this.mensajeError = error instanceof Error ? error.message : 'No se pudo guardar el usuario.';
    } finally {
      this.guardandoUsuario = false;
      this.cd.detectChanges();
    }
  }`);
text = replace(text, '    this.editandoUsuarioId = usuario.uid;', "    this.editandoUsuarioId = usuario.uid;\n    this.passwordUsuario = '';");
text = replace(text, "      seccionalNombre: usuario.seccionalNombre || '',", "      seccionalNombre: usuario.seccionalNombre || '',\n      enlaceUid: usuario.enlaceUid || '',\n      enlaceNombre: usuario.enlaceNombre || '',\n      delegadoUid: usuario.delegadoUid || '',\n      delegadoNombre: usuario.delegadoNombre || '',");
text = replace(text, "  limpiarFormularioUsuario(): void {\r\n    this.editandoUsuarioId = '';", "  limpiarFormularioUsuario(): void {\r\n    this.editandoUsuarioId = '';\n    this.passwordUsuario = '';");
text = replace(text, '  async cambiarEstadoUsuario(', `  async eliminarUsuario(usuario: UsuarioSistema): Promise<void> {
    if (this.guardandoUsuario || usuario.rol === 'coordinador') return;
    if (!window.confirm('¿Eliminar definitivamente a ' + usuario.nombre + '? Se borrarán su acceso y su perfil.')) return;
    this.guardandoUsuario = true;
    this.limpiarMensajes();
    try {
      await this.jerarquiaService.eliminarUsuario(usuario.uid);
      if (this.editandoUsuarioId === usuario.uid) this.limpiarFormularioUsuario();
      this.mensajeExito = 'Usuario eliminado correctamente.';
    } catch (error) {
      this.mensajeError = error instanceof Error ? error.message : 'No se pudo eliminar el usuario.';
    } finally {
      this.guardandoUsuario = false;
      this.cd.detectChanges();
    }
  }

  async cambiarEstadoUsuario(`);
text = method(text, 'guardarMovilizadorDesdeMonitoreo', `async guardarMovilizadorDesdeMonitoreo(): Promise<void> {
    if (this.guardandoMovilizador) return;
    this.limpiarMensajes();
    const formulario = this.formMovilizadorMonitoreo;
    if (!this.esCoordinador && !this.esSeccional && !this.esEnlace) this.mensajeError = 'No tienes permiso para agregar movilizadores.';
    else if (!formulario.nombre.trim() || !formulario.correo.trim()) this.mensajeError = 'Captura el nombre y correo del movilizador.';
    else if (this.esCoordinador && !formulario.seccionalUid) this.mensajeError = 'Selecciona el delegado responsable.';
    else if (!formulario.uid && this.passwordMovilizador.length < 6) this.mensajeError = 'La contraseña debe tener al menos 6 caracteres.';
    if (this.mensajeError) { this.cd.detectChanges(); return; }
    this.guardandoMovilizador = true;
    try {
      if (!formulario.uid) {
        try {
          formulario.uid = await this.jerarquiaService.crearCuenta(formulario.correo, this.passwordMovilizador);
        } catch (error) {
          if (!this.esEnlace || (error as { code?: string }).code !== 'EMAIL_EXISTS') throw error;
          await this.jerarquiaService.recuperarMovilizador(formulario.nombre.trim(), formulario.correo.trim());
          this.passwordMovilizador = '';
          this.limpiarFormularioMovilizadorMonitoreo();
          this.mensajeExito = 'La cuenta existente fue recuperada y vinculada a tu enlace.';
          return;
        }
        this.passwordMovilizador = '';
      }
      const usuario: UsuarioSistema = { uid: formulario.uid, nombre: formulario.nombre.trim(), correo: formulario.correo.trim(), rol: 'movilizador', activo: true };
      if (this.esEnlace) {
        await this.jerarquiaService.guardar(usuario, this.uidUsuarioActual);
      } else {
        const usuarios = await firstValueFrom(this.usuarios$);
        const delegado = this.esSeccional ? { uid: this.uidUsuarioActual, nombre: this.nombreUsuarioActual } : usuarios.find((item) => item.uid === formulario.seccionalUid && item.rol === 'seccional');
        if (!delegado) throw new Error('No se encontró el delegado seleccionado.');
        await this.usuariosService.guardarUsuario({ ...usuario, seccionalUid: delegado.uid, seccionalNombre: delegado.nombre });
        this.jerarquiaService.notificarCambios();
      }
      this.mensajeExito = 'Movilizador guardado correctamente.';
      this.limpiarFormularioMovilizadorMonitoreo();
      this.abrirPanel('jerarquia');
    } catch (error) {
      this.mensajeError = error instanceof Error ? error.message : 'No se pudo guardar el movilizador.';
    } finally {
      this.guardandoMovilizador = false;
      this.cd.detectChanges();
    }
  }`);
text = replace(text, '  limpiarFormularioMovilizadorMonitoreo(): void {', "  limpiarFormularioMovilizadorMonitoreo(): void {\n    this.passwordMovilizador = '';");
write(file, text);

file = 'src/app/pages/estructura/estructura.html';
text = read(file);
text = replace(text, 'Primero crea el usuario en Firebase Authentication, copia su UID y\r\n              luego registra aquí su perfil y rol.', 'La cuenta de acceso y su UID se crean automáticamente al guardar.');
text = replace(text, '<div class="form-group">\r\n                <label>UID del usuario</label>', '<div class="form-group" *ngIf="recuperandoUid">\r\n                <label>UID del usuario</label>');
text = replace(text, '<div class="form-group">\r\n                <label>Rol del usuario</label>', `<div class="form-group" *ngIf="!formUsuario.uid">
                <label for="passwordUsuario">Contraseña del usuario</label>
                <input type="password" id="passwordUsuario" name="passwordUsuario" [(ngModel)]="passwordUsuario" minlength="6" autocomplete="new-password" placeholder="Mínimo 6 caracteres" required />
              </div>
              <div class="form-group">
                <label>Rol del usuario</label>`);
text = replace(text, '<option value="movilizador">', '<option value="enlace">Enlace - Registro y estructura</option>\n                    <option value="movilizador">');
text = replace(text, `<div class="form-group" *ngIf="formUsuario.rol === 'movilizador'">`, `<div class="form-group" *ngIf="formUsuario.rol === 'enlace'">`);
text = replace(text, '              <div class="acciones-form">\r\n                <button\r\n                  type="button"\r\n                  class="btn secundario"\r\n                  (click)="limpiarFormularioUsuario()"', `              <div class="form-group" *ngIf="formUsuario.rol === 'movilizador'">
                <label>Enlace responsable</label>
                <select name="enlaceResponsable" [(ngModel)]="formUsuario.enlaceUid" required>
                  <option value="">Selecciona enlace</option>
                  <option *ngFor="let enlace of enlaces$ | async" [value]="enlace.uid">{{ enlace.nombre }} · {{ enlace.seccionalNombre }}</option>
                </select>
              </div>
              <div class="acciones-form">
                <button
                  type="button"
                  class="btn secundario"
                  (click)="limpiarFormularioUsuario()"`);
text = replace(text, '<small>Rol: {{ usuario.rol }}</small>', '<small>Rol: {{ nombresRol[usuario.rol] }}</small>\n                  <small *ngIf="usuario.enlaceNombre">Enlace: {{ usuario.enlaceNombre }}</small>');
text = replace(text, '[disabled]="usuario.rol === \'coordinador\'"', '[disabled]="guardandoUsuario || usuario.rol === \'coordinador\'"');
text = replace(text, '(click)="cambiarEstadoUsuario(usuario)"', '(click)="usuario.activo ? eliminarUsuario(usuario) : cambiarEstadoUsuario(usuario)"');
text = replace(text, "? 'Desactivar'", "? 'Eliminar'");
text = replace(text, '<section class="jerarquia-section">', `<app-jerarquia *ngIf="esCoordinador || esEnlace" />
        <section class="jerarquia-section">`);
text = replace(text, 'Registra un movilizador y asígnalo al seccional responsable.\r\n                  Primero debe existir el usuario en Firebase Authentication para\r\n                  copiar su UID.', "{{ esEnlace ? 'Registra un movilizador vinculado a tu enlace.' : 'Registra un movilizador y asígnalo al delegado responsable.' }} La cuenta de acceso se crea automáticamente.");
text = replace(text, '<h2>Agregar movilizador a seccional</h2>', "<h2>{{ esEnlace ? 'Agregar movilizador a enlace' : 'Agregar movilizador a delegado' }}</h2>");
text = replace(text, '<div class="form-group">\r\n                    <label>UID del movilizador</label>', '<div class="form-group" *ngIf="recuperandoUid">\r\n                    <label>UID del movilizador</label>');
text = replace(text, '<div class="form-group" *ngIf="esCoordinador">\r\n                    <label>Seccional responsable</label>', `<div class="form-group" *ngIf="!formMovilizadorMonitoreo.uid">
                    <label for="passwordMovilizador">Contraseña del movilizador</label>
                    <input id="passwordMovilizador" type="password" name="passwordMovilizador" [(ngModel)]="passwordMovilizador" minlength="6" autocomplete="new-password" placeholder="Mínimo 6 caracteres" required />
                  </div>
                  <div class="form-group" *ngIf="esEnlace">
                    <label>Enlace responsable</label>
                    <input type="text" [value]="nombreUsuarioActual" readonly />
                    <small>El movilizador quedará vinculado a tu cuenta de enlace.</small>
                  </div>
                  <div class="form-group" *ngIf="esCoordinador">
                    <label>Seccional responsable</label>`);
text = replace(text, '                    <button type="submit" class="btn primario">\r\n                      Guardar movilizador', '                    <button type="submit" class="btn primario" [disabled]="guardandoMovilizador">\r\n                      Guardar movilizador');
text = replace(text, '<button type="submit" class="btn primario">\r\n                  {{\r\n                    editandoUsuarioId', '<button type="submit" class="btn primario" [disabled]="guardandoUsuario">\r\n                  {{\r\n                    editandoUsuarioId');
// El árbol anterior se sustituye por el componente nativo con el nivel de enlace.
const start = text.indexOf('            <ng-container *ngIf="esCoordinador">', text.indexOf('<!-- MONITOREO -->'));
const end = text.lastIndexOf('            </ng-container>');
if (start < 0 || end < start) throw new Error('No se encontró el árbol anterior');
text = text.slice(0, start) + text.slice(end + '            </ng-container>'.length);
write(file, text);
