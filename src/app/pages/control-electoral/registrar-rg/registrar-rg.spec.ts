import { RecorteIneService } from '../../../core/services/recorte-ine.service';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { RegistrarRg } from './registrar-rg';
import { RegistroVotante } from '../../registro-votante/registro-votante';
import { ColoniasService } from '../../../core/services/colonias.service';
import { UsuariosService } from '../../../core/services/usuarios.service';
import { IneOcrService } from '../../../core/services/ine-ocr.service';
import { JerarquiaService } from '../../../core/services/jerarquia.service';
import { RegistroRgService } from '../../../core/services/registro-rg.service';
import { VotantesService } from '../../../core/services/votantes.service';
import { REGISTRO_PERSONA_DESTINO } from '../../../core/services/registro-persona-destino';

describe('Registrar RG con el formulario y la extracción de INE existentes', () => {
  let fixture: ComponentFixture<RegistrarRg>;
  let formulario: RegistroVotante;
  const rg = { registrar: vi.fn() };
  const simpatizantes = { registrarVotante: vi.fn() };
  const ocr = { leerIne: vi.fn() };
  const catalogos = { asegurarCatalogos: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
    vi.spyOn(RegistroVotante.prototype, 'ngOnInit').mockImplementation(() => {});
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    localStorage.clear();
    localStorage.setItem('rolUsuario', 'coordinador');
    localStorage.setItem('uid', 'coordinador');
    catalogos.asegurarCatalogos.mockResolvedValue({ faltaSeccion: false, faltaColonia: false });
    rg.registrar.mockResolvedValue('PRUEBA123456789000');
    ocr.leerIne.mockResolvedValue({
      ok: true,
      texto: 'Lectura simulada',
      datos: {
        nombreCompleto: 'Persona RG de prueba',
        direccion: 'Calle de prueba 1',
        colonia: 'Centro',
        claveElector: 'PRUEBA123456789000',
        seccion: 123,
        edad: 35,
        curp: '',
      },
    });
    await TestBed.configureTestingModule({
      imports: [RegistrarRg],
      providers: [
        provideRouter([]),
        {
          provide: ColoniasService,
          useValue: { obtenerColonias: () => of([{ nombre: 'Centro', activo: true }]) },
        },
        { provide: UsuariosService, useValue: { obtenerUsuarios: () => of([]) } },
        { provide: IneOcrService, useValue: ocr },
        { provide: JerarquiaService, useValue: catalogos },
        { provide: RegistroRgService, useValue: rg },
        { provide: VotantesService, useValue: simpatizantes },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(RegistrarRg);
    await fixture.whenStable();
    formulario = fixture.debugElement.query(By.directive(RegistroVotante)).componentInstance;
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  function completar(): void {
    formulario.formVotante = {
      nombreCompleto: 'Persona RG de prueba',
      telefono: '2871234567',
      direccion: 'Calle de prueba 1',
      edad: 35,
      claveElector: 'PRUEBA123456789000',
      seccion: 123,
      municipio: 'Tuxtepec',
      colonia: 'Centro',
      tieneFacebook: false,
      usuarioFacebook: '',
      seccionalUid: '',
      movilizadorUid: '',
    };
  }

  function prepararImagen(): Event {
    vi.spyOn(TestBed.inject(RecorteIneService), 'editar').mockResolvedValue(new Blob(['recorte'], { type: 'image/jpeg' }));
    const conversion = formulario as unknown as {
      convertirImagenABase64(archivo: File): Promise<string>;
    };
    vi.spyOn(conversion, 'convertirImagenABase64').mockResolvedValue(
      'data:image/png;base64,cHJ1ZWJh',
    );
    const input = document.createElement('input');
    input.type = 'file';
    Object.defineProperty(input, 'files', {
      value: [new File(['imagen simulada'], 'prueba.png', { type: 'image/png' })],
    });
    return { target: input } as unknown as Event;
  }

  it('muestra Registrar RG con los mismos campos y la captura de INE', () => {
    const elemento: HTMLElement = fixture.nativeElement;
    expect(elemento.querySelector('h1')?.textContent).toBe('Registrar RG');
    for (const nombre of [
      'nombreCompleto',
      'telefono',
      'direccion',
      'edad',
      'claveElector',
      'seccion',
      'municipio',
      'colonia',
    ]) {
      expect(elemento.querySelector(`[name="${nombre}"]`)).toBeTruthy();
    }
    expect(elemento.querySelector('input[type="file"]')).toBeTruthy();
    expect(elemento.querySelector('.btn-guardar')?.textContent).toContain('Guardar RG');
  });

  it('guarda en el destino RG sin crear un simpatizante', async () => {
    completar();
    await formulario.registrarVotante();
    expect(rg.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        nombreCompleto: 'PERSONA RG DE PRUEBA',
        claveElector: 'PRUEBA123456789000',
        seccion: 123,
      }),
    );
    expect(simpatizantes.registrarVotante).not.toHaveBeenCalled();
    expect(formulario.mensajeExito).toContain('RG');
  });

  it('registra RG sin delegado ni movilizador y omite asignaciones anteriores', async () => {
    expect(fixture.nativeElement.querySelector('[name="seccionalResponsableRegistro"]')).toBeNull();
    expect(
      fixture.nativeElement.querySelector('[name="movilizadorResponsableCoordinador"]'),
    ).toBeNull();
    completar();
    formulario.usuarios$ = of([
      { uid: 'delegado', nombre: 'Delegado de prueba', correo: '', rol: 'seccional', activo: true },
    ]);
    formulario.formVotante.seccionalUid = 'delegado';
    await formulario.registrarVotante();
    expect(rg.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
          seccionalUid: '',
          seccionalNombre: '',
        movilizadorUid: '',
        movilizadorNombre: '',
        capturadoPorUid: 'coordinador',
      }),
    );
    expect(formulario.mensajeError).toBe('');
  });

  it('extrae automáticamente los datos de la INE con el mismo servicio OCR', async () => {
    await formulario.procesarImagenINE(prepararImagen());
    expect(ocr.leerIne).toHaveBeenCalledWith('data:image/png;base64,cHJ1ZWJh');
    expect(formulario.formVotante).toMatchObject({
      nombreCompleto: 'Persona RG de prueba',
      direccion: 'Calle de prueba 1',
      colonia: 'Centro',
      claveElector: 'PRUEBA123456789000',
      seccion: 123,
      edad: 35,
    });
    expect(formulario.procesandoINE).toBe(false);
  });

  it('conserva los datos y muestra el duplicado como RG cuando falla el guardado', async () => {
    completar();
    rg.registrar.mockRejectedValueOnce(new Error('REGISTRO_REPETIDO'));
    await formulario.registrarVotante();
    expect(formulario.formVotante.claveElector).toBe('PRUEBA123456789000');
    expect(formulario.mensajeError).toContain('Ya existe un RG');
    expect(formulario.mensajeExito).toBe('');
  });

  it('mantiene separadas las colas sin conexión de RG y simpatizantes', () => {
    const destinoRg = fixture.debugElement
      .query(By.directive(RegistroVotante))
      .injector.get(REGISTRO_PERSONA_DESTINO);
    const destinoOriginal = TestBed.inject(REGISTRO_PERSONA_DESTINO);
    expect(destinoRg.nombreBaseDatos).toBe('control-electoral-rg-ine-offline');
    expect(destinoOriginal.nombreBaseDatos).toBe('promocion-voto-ine-offline');
    expect(destinoOriginal.tipo).toBe('simpatizante');
  });

  it('prepara la foto sin conexión para procesarla después sin llamar al OCR ni guardar en Firebase', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await formulario.procesarImagenINE(prepararImagen());
    expect(formulario.imagenInePendienteBase64).toBe('data:image/png;base64,cHJ1ZWJh');
    expect(ocr.leerIne).not.toHaveBeenCalled();
    expect(rg.registrar).not.toHaveBeenCalled();
    expect(simpatizantes.registrarVotante).not.toHaveBeenCalled();
  });
});
