import { DialogosService } from '../../../core/services/dialogos.service';
import { ColoniasService } from '../../../core/services/colonias.service';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BehaviorSubject, throwError, of } from 'rxjs';
import { vi } from 'vitest';
import { AsignarRutas } from './asignar-rutas';
import { RegistroRgService } from '../../../core/services/registro-rg.service';
import { ControlElectoralService } from '../../../core/services/control-electoral.service';
import { RgCapturado } from '../../../core/models/asignacion-rg.model';
import { SeccionAsignada } from '../../../core/models/seccion-asignada.model';
import { ImpresionRutaService } from '../../../core/printing/impresion-ruta.service';

describe('Vinculación de RG y rutas', () => {
  let fixture: ComponentFixture<AsignarRutas>;
  let componente: AsignarRutas;
  let rgs: BehaviorSubject<RgCapturado[]>;
  let secciones: BehaviorSubject<SeccionAsignada[]>;
  const servicioRg = { obtenerRgs: vi.fn(), asignarRuta: vi.fn() };
  const control = { obtenerSeccionesAsignadas: vi.fn() };
  const impresion = { imprimir: vi.fn(), limpiar: vi.fn() };
  const sinRuta: RgCapturado = {
    id: 'rg1',
    nombreCompleto: 'María de prueba',
    telefono: '2871234567',
    seccion: 123,
    colonia: 'Centro',
    claveElector: 'PRUEBA1',
    numeroRutaAsignada: null,
  };
  const conRuta: RgCapturado = {
    ...sinRuta,
    id: 'rg2',
    nombreCompleto: 'José de prueba',
    numeroRutaAsignada: 2,
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    rgs = new BehaviorSubject([structuredClone(sinRuta), structuredClone(conRuta)]);
    secciones = new BehaviorSubject<SeccionAsignada[]>([
      {
        id: '100',
        seccion: 100,
        numeroRuta: 1,
        casillas: [{ tipo: 'basica', numero: 1, numeroContigua: null }],
      },
      {
        id: '101',
        seccion: 101,
        numeroRuta: 1,
        casillas: [{ tipo: 'contigua', numero: 1, numeroContigua: null }],
      },
      {
        id: '200',
        seccion: 200,
        numeroRuta: 2,
        casillas: [{ tipo: 'basica', numero: 1, numeroContigua: null }],
      },
    ]);
    servicioRg.obtenerRgs.mockReturnValue(rgs.asObservable());
    servicioRg.asignarRuta.mockResolvedValue(undefined);
    control.obtenerSeccionesAsignadas.mockReturnValue(secciones.asObservable());
    await TestBed.configureTestingModule({
      imports: [AsignarRutas],
      providers: [
        provideRouter([]),
        { provide: ColoniasService, useValue: { obtenerColonias: () => of([{ nombre: 'El Castillo', municipio: 'Tuxtepec', activo: true, secciones: [200] }]) } },
        { provide: RegistroRgService, useValue: servicioRg },
        { provide: ControlElectoralService, useValue: control },
        { provide: ImpresionRutaService, useValue: impresion },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AsignarRutas);
    componente = fixture.componentInstance;
    await fixture.whenStable();
  });

  afterEach(() => vi.restoreAllMocks());

  it('muestra RG capturados y agrupa las secciones en las rutas creadas', () => {
    expect(fixture.nativeElement.querySelectorAll('.rg-card')).toHaveLength(2);
    expect(fixture.nativeElement.querySelectorAll('.ruta-card')).toHaveLength(2);
    expect(componente.rutas()[0].secciones.map((seccion) => seccion.seccion)).toEqual([100, 101]);
    expect(componente.rutas()[0].totalCasillas).toBe(2);
    expect(componente.asignados()).toBe(1);
    expect(componente.pendientes()).toBe(1);
  });

  it('asigna una ruta y actualiza la lista sin modificar los datos personales', async () => {
    componente.seleccionar(sinRuta, '1');
    await componente.asignar(sinRuta);
    expect(servicioRg.asignarRuta).toHaveBeenCalledWith('rg1', 1, null);
    expect(componente.rgs()[0]).toEqual({ ...sinRuta, numeroRutaAsignada: 1 });
    expect(componente.asignados()).toBe(2);
    expect(componente.rgsDeRuta(1).map((rg) => rg.id)).toEqual(['rg1']);
    expect(componente.exito()).toContain('Ruta 1 asignada');
  });

  it('imprime solo la ruta seleccionada con el RG que tiene asignado', () => {
    componente.imprimirRuta(2);
    expect(impresion.imprimir).toHaveBeenCalledTimes(1);
    const documento = new DOMParser().parseFromString(
      impresion.imprimir.mock.calls[0][0],
      'text/html',
    );
    expect(documento.querySelector('h1')?.textContent).toBe('Ruta 2');
    expect(documento.querySelector('.datos-rg')?.textContent).toContain('José de prueba');
    expect(documento.querySelector('tbody')?.textContent).toContain('200');
    expect(documento.querySelector('tbody tr')?.children[1].textContent).toBe('El Castillo');
    expect(documento.querySelector('tbody')?.textContent).not.toContain('100');
  });

  it('impide imprimir una ruta sin un RG asignado', () => {
    componente.imprimirRuta(1);
    expect(impresion.imprimir).not.toHaveBeenCalled();
    expect(componente.error()).toContain('Asigna un solo RG');
    const botones: NodeListOf<HTMLButtonElement> =
      fixture.nativeElement.querySelectorAll('.btn-imprimir');
    expect(botones[0].disabled).toBe(true);
    expect(botones[1].disabled).toBe(false);
  });

  it('no permite asignar a otro RG una ruta que ya está ocupada', async () => {
    componente.seleccionar(sinRuta, '2');
    expect(componente.rutaOcupada(2, sinRuta.id)).toBe(true);
    expect(componente.tieneCambio(sinRuta)).toBe(false);
    await componente.asignar(sinRuta);
    expect(servicioRg.asignarRuta).not.toHaveBeenCalled();
    await fixture.whenStable();
    const selector: HTMLSelectElement = fixture.nativeElement.querySelector('#ruta-rg-rg1');
    expect([...selector.options].find((opcion) => opcion.value === '2')?.disabled).toBe(true);
    expect(componente.rutaOcupada(2, conRuta.id)).toBe(false);
  });

  it('libera la ruta para otro RG al quitar al responsable anterior', async () => {
    vi.spyOn(TestBed.inject(DialogosService), 'confirmar').mockResolvedValue(true);
    await componente.quitar(conRuta);
    expect(componente.rutaOcupada(2, sinRuta.id)).toBe(false);
    componente.seleccionar(sinRuta, '2');
    await componente.asignar(sinRuta);
    expect(servicioRg.asignarRuta).toHaveBeenLastCalledWith('rg1', 2, null);
  });

  it('no guarda una ruta que no existe ni una asignación sin cambios', async () => {
    componente.seleccionar(sinRuta, '99');
    await componente.asignar(sinRuta);
    await componente.asignar(conRuta);
    expect(servicioRg.asignarRuta).not.toHaveBeenCalled();
  });

  it('pide confirmación antes de cambiar una ruta existente', async () => {
    const confirmar = vi.spyOn(TestBed.inject(DialogosService), 'confirmar').mockResolvedValue(false);
    componente.seleccionar(conRuta, '1');
    await componente.asignar(conRuta);
    expect(servicioRg.asignarRuta).not.toHaveBeenCalled();
    confirmar.mockResolvedValue(true);
    await componente.asignar(conRuta);
    expect(servicioRg.asignarRuta).toHaveBeenCalledWith('rg2', 1, 2);
  });

  it('quita solo la asociación después de confirmar y conserva el RG', async () => {
    const confirmar = vi.spyOn(TestBed.inject(DialogosService), 'confirmar').mockResolvedValue(false);
    await componente.quitar(conRuta);
    expect(servicioRg.asignarRuta).not.toHaveBeenCalled();
    confirmar.mockResolvedValue(true);
    await componente.quitar(conRuta);
    expect(servicioRg.asignarRuta).toHaveBeenCalledWith('rg2', null, 2);
    expect(componente.rgs()).toHaveLength(2);
    expect(componente.rgs().find((rg) => rg.id === 'rg2')?.numeroRutaAsignada).toBeNull();
  });

  it('conserva la selección cuando falla el guardado, sin mostrar un éxito falso', async () => {
    componente.seleccionar(sinRuta, '1');
    servicioRg.asignarRuta.mockRejectedValueOnce(new Error('La ruta cambió en otra sesión.'));
    await componente.asignar(sinRuta);
    expect(componente.seleccion(sinRuta)).toBe('1');
    expect(componente.rgs()[0].numeroRutaAsignada).toBeNull();
    expect(componente.exito()).toBe('');
    expect(componente.error()).toContain('otra sesión');
    expect(componente.guardandoId()).toBe('');
  });

  it('detecta rutas que se quedaron sin secciones y permite consultar los RG pendientes', () => {
    secciones.next(secciones.value.filter((seccion) => seccion.numeroRuta !== 2));
    expect(componente.asignados()).toBe(0);
    expect(componente.pendientes()).toBe(2);
    componente.filtroRuta.set('pendientes');
    expect(componente.rgsFiltrados()).toHaveLength(2);
    componente.busqueda.set('maria');
    expect(componente.rgsFiltrados().map((rg) => rg.id)).toEqual(['rg1']);
  });

  it('presenta enlaces para crear los registros cuando no hay RG ni rutas', async () => {
    rgs.next([]);
    secciones.next([]);
    await fixture.whenStable();
    expect(
      fixture.nativeElement.querySelector('a[href="/control-electoral/registrar-rg"]'),
    ).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.vacio a[href="/control-electoral"]')).toBeTruthy();
  });

  it('permite reintentar la lectura cuando hay un error de conexión', () => {
    servicioRg.obtenerRgs.mockReturnValueOnce(throwError(() => new Error('Sin conexión')));
    componente.cargar();
    expect(componente.errorCarga()).not.toBe('');
    componente.cargar();
    expect(componente.errorCarga()).toBe('');
    expect(componente.cargando()).toBe(false);
  });
});
