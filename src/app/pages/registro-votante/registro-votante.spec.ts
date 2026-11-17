import { DialogosService } from '../../core/services/dialogos.service';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { RegistroVotante } from './registro-votante';
import { ColoniasService } from '../../core/services/colonias.service';
import { IneOcrService } from '../../core/services/ine-ocr.service';
import { UsuariosService } from '../../core/services/usuarios.service';
import { VotantesService } from '../../core/services/votantes.service';
import { JerarquiaService } from '../../core/services/jerarquia.service';

describe('Catálogos del registro de simpatizantes', () => {
  let component: RegistroVotante;
  let fixture: ComponentFixture<RegistroVotante>;
  const catalogos = { asegurarCatalogos: vi.fn() };
  const votantes = { registrarVotante: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
    vi.spyOn(RegistroVotante.prototype, 'ngOnInit').mockImplementation(() => {});
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    catalogos.asegurarCatalogos.mockResolvedValue({ faltaSeccion: false, faltaColonia: false });
    localStorage.clear();
    localStorage.setItem('rolUsuario', 'coordinador');
    localStorage.setItem('uid', 'actual');
    await TestBed.configureTestingModule({
      imports: [RegistroVotante],
      providers: [
        {
          provide: ColoniasService,
          useValue: { obtenerColonias: () => of([{ nombre: 'Centro', activo: true }]) },
        },
        { provide: UsuariosService, useValue: { obtenerUsuarios: () => of([]) } },
        { provide: IneOcrService, useValue: {} },
        { provide: VotantesService, useValue: votantes },
        { provide: JerarquiaService, useValue: catalogos },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(RegistroVotante);
    component = fixture.componentInstance;
    component.formVotante = {
      nombreCompleto: 'Persona de prueba',
      telefono: '2871234567',
      direccion: 'Calle 1',
      edad: 25,
      claveElector: 'PRUEBA123456789000',
      seccion: 123,
      municipio: 'Tuxtepec',
      colonia: 'Centro',
      seccionalUid: '',
      movilizadorUid: '',
      tieneFacebook: false,
      usuarioFacebook: '',
    };
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  const asentamientos = [
    { nombre: 'SANTA FE', tipo: 'COLONIA' as const, secciones: [1012, 1016, 1017], municipio: 'Tuxtepec', activo: true },
    { nombre: 'SAN BARTOLO', tipo: 'LOCALIDAD' as const, secciones: [1044, 1045], municipio: 'Tuxtepec', activo: true },
    { nombre: 'CAMELIA ROJA', tipo: 'LOCALIDAD' as const, secciones: [1048], municipio: 'Tuxtepec', activo: true },
  ];

  it('filtra colonias y localidades por todas sus secciones', () => {
    component.formVotante.seccion = 1017;
    expect(component.coloniasParaSeccion(asentamientos).map((c) => c.nombre)).toEqual(['SANTA FE']);
    component.formVotante.seccion = 1045;
    expect(component.coloniasParaSeccion(asentamientos).map((c) => c.nombre)).toEqual(['SAN BARTOLO']);
  });

  it('asigna automáticamente una sección única y permite elegir entre varias', async () => {
    component.colonias$ = of(asentamientos);
    component.formVotante.seccion = null;
    await component.alCambiarColonia('SAN BARTOLO');
    expect(component.formVotante.seccion).toBeNull();
    await component.alCambiarColonia('CAMELIA ROJA');
    expect(component.formVotante.seccion).toBe(1048);
  });

  it('rechaza una sección que no corresponde al asentamiento antes de guardar', async () => {
    component.colonias$ = of(asentamientos);
    component.formVotante.colonia = 'SAN BARTOLO';
    component.formVotante.seccion = 1012;
    await component.registrarVotante();
    expect(votantes.registrarVotante).not.toHaveBeenCalled();
    expect(component.mensajeError).toContain('1044, 1045');
  });

  it('guarda una localidad del catálogo sin crear otra colonia', async () => {
    component.colonias$ = of(asentamientos);
    component.formVotante.colonia = 'SAN BARTOLO';
    component.formVotante.seccion = 1045;
    await component.registrarVotante();
    expect(catalogos.asegurarCatalogos).not.toHaveBeenCalled();
    expect(votantes.registrarVotante).toHaveBeenCalledWith(expect.objectContaining({ colonia: 'SAN BARTOLO', seccion: 1045 }));
  });

  it('no guarda ni crea catálogos al cancelar', async () => {
    catalogos.asegurarCatalogos.mockResolvedValue({ faltaSeccion: true, faltaColonia: true });
    vi.spyOn(TestBed.inject(DialogosService), 'confirmar').mockResolvedValue(false);
    await component.registrarVotante();
    expect(votantes.registrarVotante).not.toHaveBeenCalled();
    expect(catalogos.asegurarCatalogos).toHaveBeenCalledTimes(1);
    expect(catalogos.asegurarCatalogos).toHaveBeenCalledWith(
      expect.objectContaining({ confirmar: false }),
    );
    expect(component.guardando).toBe(false);
  });

  it('confirma los catálogos antes de guardar una colonia nueva', async () => {
    component.formVotante.colonia = 'Colonia nueva';
    catalogos.asegurarCatalogos.mockResolvedValueOnce({ faltaSeccion: false, faltaColonia: true });
    vi.spyOn(TestBed.inject(DialogosService), 'confirmar').mockResolvedValue(true);
    await component.registrarVotante();
    expect(catalogos.asegurarCatalogos).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ colonia: 'Colonia nueva', confirmar: true }),
    );
    expect(votantes.registrarVotante).toHaveBeenCalledWith(
      expect.objectContaining({ colonia: 'Colonia nueva' }),
    );
  });

  it('no pide confirmación para catálogos existentes', async () => {
    const confirmacion = vi.spyOn(TestBed.inject(DialogosService), 'confirmar');
    await component.registrarVotante();
    expect(confirmacion).not.toHaveBeenCalled();
    expect(votantes.registrarVotante).toHaveBeenCalledTimes(1);
  });

  it('no llama al servidor de catálogos al guardar sin conexión', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await component.registrarVotante();
    expect(catalogos.asegurarCatalogos).not.toHaveBeenCalled();
    expect(votantes.registrarVotante).toHaveBeenCalledTimes(1);
  });

  it('muestra búsqueda de colonia con sugerencias nativas', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('input[name="colonia"][list]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('datalist option[value="Centro"]')).toBeTruthy();
  });
});
