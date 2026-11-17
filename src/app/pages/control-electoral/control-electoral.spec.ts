import { DialogosService } from '../../core/services/dialogos.service';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject, throwError } from 'rxjs';
import { vi } from 'vitest';
import { provideRouter } from '@angular/router';
import { ControlElectoral } from './control-electoral';
import { ControlElectoralService } from '../../core/services/control-electoral.service';
import { SeccionAsignada } from '../../core/models/seccion-asignada.model';

describe('Control Electoral: registro de secciones asignadas', () => {
  let fixture: ComponentFixture<ControlElectoral>;
  let component: ControlElectoral;
  let registros: BehaviorSubject<SeccionAsignada[]>;
  const servicio = {
    obtenerSeccionesAsignadas: vi.fn(),
    guardarSeccion: vi.fn(),
    eliminarSeccion: vi.fn(),
  };
  const registro: SeccionAsignada = {
    id: '123',
    seccion: 123,
    numeroRuta: 5,
    casillas: [{ tipo: 'basica', numero: 1, numeroContigua: null }],
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    registros = new BehaviorSubject<SeccionAsignada[]>([]);
    servicio.obtenerSeccionesAsignadas.mockReturnValue(registros.asObservable());
    servicio.guardarSeccion.mockResolvedValue(undefined);
    servicio.eliminarSeccion.mockResolvedValue(undefined);
    await TestBed.configureTestingModule({
      imports: [ControlElectoral],
      providers: [provideRouter([]), { provide: ControlElectoralService, useValue: servicio }],
    }).compileComponents();
    fixture = TestBed.createComponent(ControlElectoral);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  afterEach(() => vi.restoreAllMocks());

  function completar(): void {
    component.formulario.seccion = 123;
    component.formulario.numeroRuta = 5;
  }

  it('registra una sección con todas sus casillas en la misma ruta', async () => {
    completar();
    component.agregarCasilla();
    await component.guardar();
    expect(servicio.guardarSeccion).toHaveBeenCalledWith(
      123,
      5,
      [
        expect.objectContaining({ tipo: 'basica', numero: 1 }),
        expect.objectContaining({ tipo: 'contigua', numero: 1 }),
      ],
      '',
    );
    expect(component.formulario.seccion).toBeNull();
    expect(component.formulario.numeroRuta).toBe(5);
    expect(component.mensajeExito()).toContain('registradas');
  });

  it('agrega contiguas numeradas dentro de la ruta elegida', () => {
    completar();
    component.agregarCasilla();
    component.agregarCasilla();
    expect(component.formulario.casillas.map((casilla) => casilla.numero)).toEqual([1, 1, 2]);
    expect(component.formulario.numeroRuta).toBe(5);
  });

  it('impide guardar duplicados antes de llamar a Firebase', async () => {
    completar();
    component.formulario.casillas.push({
      ...component.formulario.casillas[0],
      clave: 999,
    });
    await component.guardar();
    expect(servicio.guardarSeccion).not.toHaveBeenCalled();
    expect(component.mensajeError()).toContain('repetida');
  });

  it('conserva el formulario cuando falla el guardado y permite reintentar', async () => {
    completar();
    servicio.guardarSeccion.mockRejectedValueOnce(new Error('Esta sección ya está registrada.'));
    await component.guardar();
    expect(component.formulario.seccion).toBe(123);
    expect(component.mensajeExito()).toBe('');
    expect(component.mensajeError()).toContain('ya está registrada');
    expect(component.guardando()).toBe(false);
    await component.guardar();
    expect(servicio.guardarSeccion).toHaveBeenCalledTimes(2);
  });

  it('edita una copia sin modificar la lista hasta guardar', () => {
    registros.next([structuredClone(registro)]);
    component.editar(component.secciones()[0]);
    component.formulario.numeroRuta = 9;
    component.formulario.casillas[0].numero = 2;
    expect(component.secciones()[0].numeroRuta).toBe(5);
    expect(component.secciones()[0].casillas[0].numero).toBe(1);
    component.limpiar();
    expect(component.editandoId()).toBe('');
  });

  it('solo elimina después de confirmar', async () => {
    const confirmar = vi.spyOn(TestBed.inject(DialogosService), 'confirmar').mockResolvedValue(false);
    await component.eliminar(registro);
    expect(servicio.eliminarSeccion).not.toHaveBeenCalled();
    confirmar.mockResolvedValue(true);
    await component.eliminar(registro);
    expect(servicio.eliminarSeccion).toHaveBeenCalledWith('123');
  });

  it('cuenta rutas distintas y filtra por sección, casilla y ruta', () => {
    registros.next([
      structuredClone(registro),
      {
        id: '456',
        seccion: 456,
        numeroRuta: 5,
        casillas: [{ tipo: 'contigua', numero: 2, numeroContigua: null }],
      },
    ]);
    expect(component.rutas()).toEqual([5]);
    expect(component.totalCasillas()).toBe(2);
    component.busqueda.set('C2');
    expect(component.seccionesFiltradas().map((seccion) => seccion.id)).toEqual(['456']);
    component.busqueda.set('');
    component.filtroRuta.set('7');
    expect(component.seccionesFiltradas()).toHaveLength(0);
  });

  it('cuenta una sola vez las secciones compartidas entre rutas', async () => {
    registros.next([
      { ...structuredClone(registro), id: '1_123', numeroRuta: 1 },
      { ...structuredClone(registro), id: '3_123', numeroRuta: 3 },
      { ...structuredClone(registro), id: '3_456', seccion: 456, numeroRuta: 3 },
    ]);
    await fixture.whenStable();
    expect(component.totalSeccionesUnicas()).toBe(2);
    expect(fixture.nativeElement.querySelector('.indicadores article strong').textContent).toBe('2');
    expect(component.totalCasillas()).toBe(3);
    component.filtroRuta.set('1');
    expect(component.totalSeccionesUnicas()).toBe(2);
    registros.next([]);
    expect(component.totalSeccionesUnicas()).toBe(0);
  });

  it('agrupa once secciones con sus casillas como una sola ruta', async () => {
    registros.next(
      Array.from({ length: 11 }, (_, indice) => ({
        id: String(1000 + indice),
        seccion: 1000 + indice,
        numeroRuta: 1,
        casillas: [
          { tipo: 'basica' as const, numero: 1, numeroContigua: null },
          { tipo: 'contigua' as const, numero: 1, numeroContigua: null },
        ],
      })),
    );
    await fixture.whenStable();
    expect(component.rutas()).toEqual([1]);
    expect(component.gruposPorRuta()).toHaveLength(1);
    expect(component.gruposPorRuta()[0].secciones).toHaveLength(11);
    expect(component.gruposPorRuta()[0].totalCasillas).toBe(22);
    expect(fixture.nativeElement.querySelectorAll('.ruta-grupo')).toHaveLength(1);
    expect(fixture.nativeElement.querySelectorAll('.registro-card')).toHaveLength(11);
  });

  it('permite reintentar una carga que falló por permisos', () => {
    servicio.obtenerSeccionesAsignadas.mockReturnValueOnce(
      throwError(() => new Error('permission-denied')),
    );
    component.cargar();
    expect(component.errorCarga()).toContain('permisos');
    component.cargar();
    expect(component.errorCarga()).toBe('');
  });
});
