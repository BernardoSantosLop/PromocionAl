import { RecorteIneService } from '../../core/services/recorte-ine.service';
import { DialogosService } from '../../core/services/dialogos.service';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { vi } from 'vitest';
import { Estructura } from './estructura';
import { SeccionesElectoralesService } from '../../core/services/secciones-electorales.service';
import { ColoniasService } from '../../core/services/colonias.service';
import { UsuariosService } from '../../core/services/usuarios.service';
import { VotantesService } from '../../core/services/votantes.service';
import { JerarquiaService } from '../../core/services/jerarquia.service';
import { ImpresionRutaService } from '../../core/printing/impresion-ruta.service';
import { IneOcrService } from '../../core/services/ine-ocr.service';

describe('Integración de usuarios publicados', () => {
  let component: Estructura;
  let fixture: ComponentFixture<Estructura>;
  const jerarquia = {
    cambios$: new Subject<void>(),
    listar: vi.fn(),
    crearCuenta: vi.fn(),
    guardar: vi.fn(),
    recuperarMovilizador: vi.fn(),
    eliminarUsuario: vi.fn(),
    notificarCambios: vi.fn(),
  };
  const usuarios = { obtenerUsuarios: () => of([]), guardarUsuario: vi.fn(), guardarFichaEnlace: vi.fn() };
  const ocr = { leerIne: vi.fn() };
  const secciones = { obtenerSecciones: () => of([]), eliminarSeccion: vi.fn() };
  const colonias = { obtenerColonias: () => of([]), eliminarColonia: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
    jerarquia.listar.mockResolvedValue({
      usuarios: [],
      simpatizantesPorMovilizador: {},
      rolSolicitante: 'coordinador',
    });
    jerarquia.crearCuenta.mockResolvedValue('uid-creado');
    jerarquia.guardar.mockResolvedValue(undefined);
    jerarquia.recuperarMovilizador.mockResolvedValue('uid-recuperado');
    localStorage.clear();
    localStorage.setItem('rolUsuario', 'coordinador');
    localStorage.setItem('uid', 'actual');
    await TestBed.configureTestingModule({
      imports: [Estructura],
      providers: [
        { provide: SeccionesElectoralesService, useValue: secciones },
        { provide: ColoniasService, useValue: colonias },
        { provide: UsuariosService, useValue: usuarios },
        { provide: VotantesService, useValue: { obtenerVotantes: () => of([]) } },
        { provide: JerarquiaService, useValue: jerarquia },
        { provide: IneOcrService, useValue: ocr },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(Estructura);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('no borra colonias ni secciones si se cancela la confirmación', async () => {
    vi.spyOn(TestBed.inject(DialogosService), 'confirmar').mockResolvedValue(false);
    await component.eliminarColonia({
      id: 'centro',
      nombre: 'Centro',
      municipio: 'Tuxtepec',
      activo: true,
    });
    await component.eliminarSeccion({
      id: '123',
      seccion: 123,
      municipio: 'Tuxtepec',
      colonia: '',
      activo: true,
    });
    expect(colonias.eliminarColonia).not.toHaveBeenCalled();
    expect(secciones.eliminarSeccion).not.toHaveBeenCalled();
  });

  it('borra una colonia inactiva tras confirmar y limpia su formulario', async () => {
    const confirmar = vi.spyOn(TestBed.inject(DialogosService), 'confirmar').mockResolvedValue(true);
    component.editandoColoniaId = 'centro';
    await component.eliminarColonia({
      id: 'centro',
      nombre: 'Centro',
      municipio: 'Tuxtepec',
      activo: false,
    });
    expect(confirmar).toHaveBeenCalledWith(expect.stringContaining('Centro'));
    expect(colonias.eliminarColonia).toHaveBeenCalledWith('centro');
    expect(component.editandoColoniaId).toBe('');
    expect(component.eliminandoColoniaId).toBe('');
  });

  it('borra la sección por su ID tras confirmar y limpia su formulario', async () => {
    const confirmar = vi.spyOn(TestBed.inject(DialogosService), 'confirmar').mockResolvedValue(true);
    component.formSeccion = { id: '123', seccion: 123, municipio: 'Tuxtepec', colonia: '', activo: true };
    await component.eliminarSeccion(component.formSeccion);
    expect(confirmar).toHaveBeenCalledWith(expect.stringContaining('123'));
    expect(secciones.eliminarSeccion).toHaveBeenCalledWith('123');
    expect(component.formSeccion.id).toBeUndefined();
    expect(component.eliminandoSeccionId).toBe('');
  });

  function nuevoEnlace(): void {
    component.fichaEnlace = {
      domicilio: 'Calle de prueba 1', colonia: 'CENTRO', codigoPostal: '00000',
      claveElector: 'PRUEBA123456789000', curp: 'PRUEBA123456789000', celular: '0000000000',
      seccion: 1028, facebook: '', ineFrente: 'data:image/jpeg;base64,cHJ1ZWJh', ineReverso: 'data:image/jpeg;base64,cHJ1ZWJh',
    };
    component.formUsuario = {
      uid: '',
      nombre: 'Enlace',
      correo: 'enlace@example.test',
      rol: 'enlace',
      activo: true,
      seccionalUid: 'delegado',
    };
    component.passwordUsuario = 'prueba123';
  }

  it('crea Authentication y guarda el enlace bajo su delegado', async () => {
    nuevoEnlace();
    await component.guardarUsuario();
    expect(jerarquia.crearCuenta).toHaveBeenCalledWith('enlace@example.test', 'prueba123');
    expect(jerarquia.guardar).toHaveBeenCalledWith(
      expect.objectContaining({ uid: 'uid-creado', rol: 'enlace' }),
      'delegado',
    );
    expect(component.passwordUsuario).toBe('');
    expect(component.formUsuario.uid).toBe('');
    expect(usuarios.guardarFichaEnlace).toHaveBeenCalledWith('uid-creado', expect.objectContaining({ colonia: 'CENTRO', seccion: 1028 }));
  });

  it('pide los datos de la boleta antes de crear el acceso', async () => {
    nuevoEnlace();
    component.fichaEnlace.curp = '';
    await component.guardarUsuario();
    expect(component.mensajeError).toContain('CURP');
    expect(jerarquia.crearCuenta).not.toHaveBeenCalled();
  });

  it('rellena la ficha con la INE y conserva los datos que no aparecen en ella', async () => {
    nuevoEnlace();
    vi.spyOn(TestBed.inject(RecorteIneService), 'editar').mockResolvedValue(new Blob(['recorte'], { type: 'image/jpeg' }));
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    component.fichaEnlace.facebook = 'Perfil manual';
    ocr.leerIne.mockResolvedValue({ ok: true, texto: '', datos: { nombreCompleto: 'Nombre detectado', direccion: 'Calle de prueba, C.P. 00001', colonia: 'Centro', claveElector: 'PRUEBA123456789001', curp: 'PRUEBA123456789002', seccion: 1029 } });
    await component.rellenarEnlaceDesdeIne();
    expect(ocr.leerIne).toHaveBeenCalledWith(expect.stringContaining('data:image'));
    expect(component.formUsuario.nombre).toBe('Nombre detectado');
    expect(component.formUsuario.correo).toBe('enlace@example.test');
    expect(component.formUsuario.seccionalUid).toBe('delegado');
    expect(component.fichaEnlace).toMatchObject({ codigoPostal: '00001', seccion: 1029, curp: 'PRUEBA123456789002', celular: '0000000000', facebook: 'Perfil manual' });
    expect(component.mensajeExito).toContain('Revisa');
    expect(component.leyendoIneEnlace).toBe(false);
  });

  it('conserva datos e imagen si falla la lectura de INE', async () => {
    nuevoEnlace();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    const anterior = { ...component.fichaEnlace };
    ocr.leerIne.mockRejectedValue(new Error('Fallo de lectura'));
    await component.rellenarEnlaceDesdeIne();
    expect(component.fichaEnlace).toEqual(anterior);
    expect(component.mensajeError).toContain('La foto se conservó');
    expect(component.leyendoIneEnlace).toBe(false);
  });

  it('lee automáticamente el frente fotografiado y conserva el reverso sin otra lectura', async () => {
    nuevoEnlace();
    vi.spyOn(TestBed.inject(RecorteIneService), 'editar').mockResolvedValue(new Blob(['recorte'], { type: 'image/jpeg' }));
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 1000, height: 600, close: vi.fn() }));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,aW1hZ2Vu');
    ocr.leerIne.mockResolvedValue({ ok: true, texto: '', datos: { nombreCompleto: 'Nombre de la fotografía' } });
    const evento = () => ({ target: { files: [new File(['foto'], 'ine.jpg', { type: 'image/jpeg' })], value: 'ine.jpg' } }) as unknown as Event;
    try {
      await component.cargarIneEnlace(evento(), 'ineFrente');
      expect(component.formUsuario.nombre).toBe('Nombre de la fotografía');
      expect(component.fichaEnlace.ineFrente).toBe('data:image/jpeg;base64,aW1hZ2Vu');
      await component.cargarIneEnlace(evento(), 'ineReverso');
      expect(component.fichaEnlace.ineReverso).toBe('data:image/jpeg;base64,aW1hZ2Vu');
      expect(ocr.leerIne).toHaveBeenCalledTimes(1);
      expect(component.imagenesProcesando).toBe(0);
    } finally { vi.unstubAllGlobals(); }
  });

  it('no llama al OCR sin internet ni borra los datos no detectados', async () => {
    nuevoEnlace();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await component.rellenarEnlaceDesdeIne();
    expect(ocr.leerIne).not.toHaveBeenCalled();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    ocr.leerIne.mockResolvedValue({ ok: true, texto: '', datos: {} });
    await component.rellenarEnlaceDesdeIne();
    expect(component.formUsuario.nombre).toBe('Enlace');
    expect(component.fichaEnlace.curp).toBe('PRUEBA123456789000');
  });

  it('ignora una lectura que termina después de cambiar de usuario', async () => {
    nuevoEnlace();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    let resolver!: (valor: unknown) => void;
    ocr.leerIne.mockReturnValue(new Promise((resolve) => { resolver = resolve; }));
    const pendiente = component.rellenarEnlaceDesdeIne();
    component.limpiarFormularioUsuario();
    resolver({ ok: true, datos: { nombreCompleto: 'Usuario anterior' } });
    await pendiente;
    expect(component.formUsuario.nombre).toBe('');
  });

  it('conserva la cuenta y la ficha para reintentar si falla el guardado de la boleta', async () => {
    nuevoEnlace();
    usuarios.guardarFichaEnlace.mockRejectedValueOnce(new Error('Error al guardar ficha'));
    await component.guardarUsuario();
    expect(component.formUsuario.uid).toBe('uid-creado');
    expect(component.fichaEnlace.ineFrente).toContain('data:image');
    await component.guardarUsuario();
    expect(jerarquia.crearCuenta).toHaveBeenCalledTimes(1);
    expect(usuarios.guardarFichaEnlace).toHaveBeenCalledTimes(2);
  });

  it('recarga la ficha al editar e imprime los datos guardados del enlace', () => {
    nuevoEnlace();
    const usuario = { ...component.formUsuario, uid: 'guardado', delegadoNombre: 'Delegado de prueba', fichaRegistro: { ...component.fichaEnlace } };
    component.editarUsuario(usuario);
    expect(component.fichaEnlace).toEqual(usuario.fichaRegistro);
    const impresion = fixture.debugElement.injector.get(ImpresionRutaService);
    const imprimir = vi.spyOn(impresion, 'imprimir').mockImplementation(() => {});
    component.imprimirBoletaEnlace(usuario);
    expect(imprimir).toHaveBeenCalledWith(expect.stringContaining('Delegado de prueba'), 'Boleta de registro de enlace');
  });

  it('reintenta solo el perfil si Authentication ya creó la cuenta', async () => {
    nuevoEnlace();
    jerarquia.guardar.mockRejectedValueOnce(new Error('Sin conexión'));
    await component.guardarUsuario();
    expect(component.formUsuario.uid).toBe('uid-creado');
    expect(component.passwordUsuario).toBe('');
    expect(component.mensajeError).toContain('Sin conexión');
    await component.guardarUsuario();
    expect(jerarquia.crearCuenta).toHaveBeenCalledTimes(1);
    expect(jerarquia.guardar).toHaveBeenCalledTimes(2);
  });

  it('valida el responsable antes de crear una cuenta', async () => {
    nuevoEnlace();
    component.formUsuario.seccionalUid = '';
    await component.guardarUsuario();
    expect(jerarquia.crearCuenta).not.toHaveBeenCalled();
    expect(component.mensajeError).toContain('delegado');
  });

  it('vincula el movilizador al enlace autenticado', async () => {
    nuevoEnlace();
    component.fichaMovilizadorMonitoreo = { ...component.fichaEnlace };
    component.esCoordinador = false;
    component.esEnlace = true;
    component.formMovilizadorMonitoreo = {
      uid: '',
      nombre: 'Persona',
      correo: 'persona@example.test',
      seccionalUid: 'otro',
    };
    component.passwordMovilizador = 'prueba123';
    await component.guardarMovilizadorDesdeMonitoreo();
    expect(jerarquia.guardar).toHaveBeenCalledWith(
      expect.objectContaining({ rol: 'movilizador' }),
      'actual',
    );
    expect(usuarios.guardarUsuario).not.toHaveBeenCalled();
  });

  it('recupera una cuenta existente para el enlace sin duplicarla', async () => {
    nuevoEnlace();
    component.fichaMovilizadorMonitoreo = { ...component.fichaEnlace };
    component.esCoordinador = false;
    component.esEnlace = true;
    component.formMovilizadorMonitoreo = {
      uid: '',
      nombre: 'Persona',
      correo: 'persona@example.test',
      seccionalUid: '',
    };
    component.passwordMovilizador = 'prueba123';
    jerarquia.crearCuenta.mockRejectedValue(
      Object.assign(new Error('Ya existe'), { code: 'EMAIL_EXISTS' }),
    );
    await component.guardarMovilizadorDesdeMonitoreo();
    expect(jerarquia.recuperarMovilizador).toHaveBeenCalledWith('Persona', 'persona@example.test');
    expect(jerarquia.guardar).toHaveBeenCalledWith(expect.objectContaining({ uid: 'uid-recuperado', fichaRegistro: expect.objectContaining({ colonia: 'CENTRO' }) }), 'actual');
  });

  it('crea un movilizador con su ficha bajo el enlace elegido en Usuarios', async () => {
    nuevoEnlace();
    component.formUsuario.rol = 'movilizador';
    component.formUsuario.enlaceUid = 'enlace-uno';
    await component.guardarUsuario();
    expect(jerarquia.guardar).toHaveBeenCalledWith(expect.objectContaining({ rol: 'movilizador', fichaRegistro: expect.objectContaining({ domicilio: 'Calle de prueba 1', codigoPostal: '00000', ineFrente: '' }) }), 'enlace-uno');
    expect(component.enlaceListadoUid).toBe('enlace-uno');
  });

  it('el delegado crea enlaces asignados a su propia cuenta con la ficha completa', async () => {
    nuevoEnlace();
    component.esCoordinador = false;
    component.esSeccional = true;
    component.formUsuario.seccionalUid = 'otro-delegado';
    await component.guardarUsuario();
    expect(jerarquia.guardar).toHaveBeenCalledWith(expect.objectContaining({ rol: 'enlace', fichaRegistro: expect.objectContaining({ ineFrente: expect.stringContaining('data:image') }) }), 'actual');
    expect(usuarios.guardarFichaEnlace).not.toHaveBeenCalled();
    expect(component.formUsuario.rol).toBe('enlace');
  });

  it('el delegado no puede crear movilizadores ni editar enlaces ajenos', async () => {
    nuevoEnlace();
    component.esCoordinador = false;
    component.esSeccional = true;
    component.formUsuario.rol = 'movilizador';
    component.formUsuario.enlaceUid = 'enlace';
    await component.guardarUsuario();
    expect(jerarquia.crearCuenta).not.toHaveBeenCalled();
    component.editarUsuario({ uid: 'ajeno', nombre: 'Enlace ajeno', correo: '', rol: 'enlace', activo: true, delegadoUid: 'otro' });
    expect(component.editandoUsuarioId).toBe('');
  });

  it('muestra Crear enlace y oculta el registro de movilizadores para el delegado', async () => {
    fixture.destroy();
    localStorage.setItem('rolUsuario', 'seccional');
    fixture = TestBed.createComponent(Estructura);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.formUsuario.rol).toBe('enlace');
    expect(fixture.nativeElement.textContent).toContain('Crear / editar enlace');
    expect(fixture.nativeElement.textContent).not.toContain('Nuevo movilizador');
    expect(fixture.nativeElement.querySelector('select[name="rolUsuario"]')).toBeNull();
    expect(component.puedeVerPanel('usuarios')).toBe(true);
    expect(component.puedeVerPanel('jerarquia')).toBe(false);
  });

  it('filtra y pagina solo los movilizadores del enlace seleccionado', () => {
    const lista = Array.from({ length: 7 }, (_, i) => ({ uid: `mov-${i}`, nombre: `Movilizador ${i}`, correo: '', activo: true, rol: 'movilizador' as const, enlaceUid: 'enlace-uno' }));
    component.enlaceListadoUid = 'enlace-uno';
    const grupos = component.gruposMovilizadores([...lista, { ...lista[0], uid: 'otro', enlaceUid: 'enlace-dos' }]);
    expect(grupos.map((g) => g.length)).toEqual([5, 2]);
    expect(grupos.flat().every((m) => m.enlaceUid === 'enlace-uno')).toBe(true);
  });

  it('el enlace solo imprime sus movilizadores aunque cambie la selección', () => {
    component.esCoordinador = false;
    component.esEnlace = true;
    component.enlaceListadoUid = 'otro';
    const enlace = { uid: 'actual', nombre: 'Enlace', correo: '', activo: true, rol: 'enlace' as const };
    const movilizador = { uid: 'mov', nombre: 'Movilizador', correo: '', activo: true, rol: 'movilizador' as const, enlaceUid: 'actual' };
    const impresion = fixture.debugElement.injector.get(ImpresionRutaService);
    const imprimir = vi.spyOn(impresion, 'imprimir').mockImplementation(() => {});
    component.imprimirMovilizadores([enlace, movilizador]);
    expect(imprimir).toHaveBeenCalledWith(expect.stringContaining('Movilizador'), 'Registro de movilizadores por enlace');
  });

  it('no elimina un usuario cuando se cancela la confirmación', async () => {
    vi.spyOn(TestBed.inject(DialogosService), 'confirmar').mockResolvedValue(false);
    await component.eliminarUsuario({
      uid: 'usuario',
      nombre: 'Persona',
      correo: '',
      rol: 'movilizador',
      activo: true,
    });
    expect(jerarquia.eliminarUsuario).not.toHaveBeenCalled();
  });

  it('el botón elimina también las cuentas inactivas mediante Firebase', async () => {
    vi.spyOn(TestBed.inject(DialogosService), 'confirmar').mockResolvedValue(true);
    component.usuarios$ = of([
      {
        uid: 'inactivo',
        nombre: 'Persona',
        correo: '',
        rol: 'movilizador',
        activo: false,
      },
    ]);
    component.abrirPanel('usuarios');
    fixture.detectChanges();
    await fixture.whenStable();
    const boton: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.item-card .btn-mini.estado',
    );
    expect(boton.textContent?.trim()).toBe('Eliminar');
    boton.click();
    await fixture.whenStable();
    expect(jerarquia.eliminarUsuario).toHaveBeenCalledWith('inactivo');
    expect(usuarios.guardarUsuario).not.toHaveBeenCalled();
  });

  it('muestra el formulario nativo de contraseña y el rol enlace', async () => {
    component.abrirPanel('usuarios');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('input[name="passwordUsuario"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('option[value="enlace"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('input[name="uidUsuario"]')).toBeNull();
  });
});
