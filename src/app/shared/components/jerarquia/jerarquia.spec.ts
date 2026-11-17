import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { vi } from 'vitest';
import { Jerarquia } from './jerarquia';
import { JerarquiaService, JerarquiaRespuesta } from '../../../core/services/jerarquia.service';
import { VotantesService } from '../../../core/services/votantes.service';
import { ImpresionRutaService } from '../../../core/printing/impresion-ruta.service';

describe('Jerarquía desplegable', () => {
  let fixture: ComponentFixture<Jerarquia>;
  let component: Jerarquia;
  const servicio = {
    cambios$: new Subject<void>(),
    listar: vi.fn(),
    asignarCuentaSinPerfil: vi.fn(),
  };
  const votantes = { obtenerSimpatizantesDeMovilizador: vi.fn() };
  const datos: JerarquiaRespuesta = {
    rolSolicitante: 'coordinador',
    simpatizantesPorMovilizador: { m: 1 },
    usuarios: [
      { uid: 'c', nombre: 'Coordinador', correo: '', rol: 'coordinador', activo: true },
      {
        uid: 'd',
        nombre: 'Carlos delegado',
        correo: '',
        rol: 'seccional',
        activo: true,
        coordinadorUid: 'c',
      },
      {
        uid: 'd2',
        nombre: 'Otro delegado',
        correo: '',
        rol: 'seccional',
        activo: true,
        coordinadorUid: 'c',
      },
      {
        uid: 'e',
        nombre: 'Enlace de Carlos',
        correo: '',
        rol: 'enlace',
        activo: true,
        seccionalUid: 'd',
      },
      {
        uid: 'm',
        nombre: 'María movilizadora',
        correo: '',
        rol: 'movilizador',
        activo: true,
        enlaceUid: 'e',
        seccionalUid: 'd',
      },
    ],
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    servicio.listar.mockResolvedValue(structuredClone(datos));
    votantes.obtenerSimpatizantesDeMovilizador.mockResolvedValue([
      { id: 'p', nombreCompleto: 'Persona de prueba', colonia: 'Centro', seccion: 123 },
    ]);
    await TestBed.configureTestingModule({
      imports: [Jerarquia],
      providers: [
        { provide: JerarquiaService, useValue: servicio },
        { provide: VotantesService, useValue: votantes },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(Jerarquia);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  async function click(rol: string): Promise<void> {
    const boton: HTMLButtonElement = fixture.nativeElement.querySelector(
      `[data-rol="${rol}"] > button`,
    );
    boton.click();
    await fixture.whenStable();
  }

  it('inicia con los delegados plegados sin descargar simpatizantes', () => {
    expect(fixture.nativeElement.querySelectorAll('[data-rol="seccional"]')).toHaveLength(2);
    expect(fixture.nativeElement.querySelector('[data-rol="enlace"]')).toBeNull();
    expect(votantes.obtenerSimpatizantesDeMovilizador).not.toHaveBeenCalled();
  });

  it('imprime los datos del movilizador elegido con diez espacios por hoja', async () => {
    const impresion = fixture.debugElement.injector.get(ImpresionRutaService);
    const imprimir = vi.spyOn(impresion, 'imprimir').mockImplementation(() => {});
    await component.imprimirSimpatizantes(datos.usuarios.find((u) => u.uid === 'm')!);
    expect(votantes.obtenerSimpatizantesDeMovilizador).toHaveBeenCalledWith('m');
    expect(imprimir).toHaveBeenCalledWith(expect.stringContaining('Persona de prueba'), 'Simpatizantes del movilizador · 10 por hoja');
    const doc = new DOMParser().parseFromString(imprimir.mock.calls[0][0], 'text/html');
    expect(doc.querySelectorAll('.persona')).toHaveLength(10);
    expect(doc.body.textContent).not.toContain('CURP');
  });

  it('informa cuando el movilizador no tiene registros y no abre la impresión', async () => {
    const impresion = fixture.debugElement.injector.get(ImpresionRutaService);
    const imprimir = vi.spyOn(impresion, 'imprimir').mockImplementation(() => {});
    votantes.obtenerSimpatizantesDeMovilizador.mockResolvedValue([]);
    await component.imprimirSimpatizantes(datos.usuarios.find((u) => u.uid === 'm')!);
    expect(imprimir).not.toHaveBeenCalled();
    expect(component.error()).toContain('todavía no tiene');
  });

  it('despliega delegado, enlace, movilizador y finalmente sus simpatizantes', async () => {
    await click('seccional');
    expect(fixture.nativeElement.querySelector('[data-rol="enlace"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-rol="movilizador"]')).toBeNull();
    await click('enlace');
    expect(votantes.obtenerSimpatizantesDeMovilizador).not.toHaveBeenCalled();
    await click('movilizador');
    expect(votantes.obtenerSimpatizantesDeMovilizador).toHaveBeenCalledWith('m');
    expect(fixture.nativeElement.querySelector('.simpatizante').textContent).toContain(
      'Persona de prueba',
    );
    expect(fixture.nativeElement.querySelector('.simpatizante').textContent).toContain('Centro');
    expect(
      fixture.nativeElement
        .querySelector('[data-rol="movilizador"] > button')
        .getAttribute('aria-expanded'),
    ).toBe('true');
    await click('movilizador');
    await click('movilizador');
    expect(votantes.obtenerSimpatizantesDeMovilizador).toHaveBeenCalledTimes(1);
  });

  it('al buscar un delegado muestra sus enlaces sin desplegar los movilizadores', async () => {
    component.cambiarBusqueda('Carlos delegado');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelectorAll('[data-rol="seccional"]')).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('[data-rol="enlace"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-rol="movilizador"]')).toBeNull();
    expect(votantes.obtenerSimpatizantesDeMovilizador).not.toHaveBeenCalled();
  });

  it('buscar un movilizador sin acentos abre su ruta y muestra sus simpatizantes', async () => {
    component.cambiarBusqueda('maria');
    await fixture.whenStable();
    expect(component.abiertos().has('d')).toBe(true);
    expect(component.abiertos().has('e')).toBe(true);
    expect(component.abiertos().has('m')).toBe(true);
    expect(fixture.nativeElement.querySelector('.simpatizante')).toBeTruthy();
    component.cambiarBusqueda('');
    await fixture.whenStable();
    expect(component.abiertos().size).toBe(0);
    expect(fixture.nativeElement.querySelectorAll('[data-rol="seccional"]')).toHaveLength(2);
  });

  it('permite reintentar errores y distingue un listado vacío', async () => {
    votantes.obtenerSimpatizantesDeMovilizador.mockRejectedValueOnce(new Error('Sin conexión'));
    component.cambiarBusqueda('maria');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.error-listado')).toBeTruthy();
    votantes.obtenerSimpatizantesDeMovilizador.mockResolvedValue([]);
    fixture.nativeElement.querySelector('.error-listado button').click();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.error-listado')).toBeNull();
    expect(fixture.nativeElement.querySelector('.simpatizantes').textContent).toContain(
      'todavía no tiene simpatizantes',
    );
  });

  it('muestra un mensaje cuando la búsqueda no coincide y permite contraer todo', async () => {
    component.cambiarBusqueda('No existe este nombre');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.vacio').textContent).toContain(
      'No encontramos coincidencias',
    );
    component.contraerTodo();
    await fixture.whenStable();
    expect(component.busqueda()).toBe('');
    expect(component.abiertos().size).toBe(0);
    expect(fixture.nativeElement.querySelectorAll('[data-rol="seccional"]')).toHaveLength(2);
  });
});
