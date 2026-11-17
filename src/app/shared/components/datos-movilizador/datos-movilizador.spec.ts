import { RecorteIneService } from '../../../core/services/recorte-ine.service';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { DatosMovilizador } from './datos-movilizador';
import { fichaEnlaceVacia } from '../../../core/models/usuario-sistema.model';
import { IneOcrService } from '../../../core/services/ine-ocr.service';

describe('Lectura de INE para movilizadores', () => {
  let fixture: ComponentFixture<DatosMovilizador>;
  let componente: DatosMovilizador;
  const ocr = { leerIne: vi.fn() };
  beforeEach(async () => {
    vi.resetAllMocks();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    await TestBed.configureTestingModule({ imports: [DatosMovilizador], providers: [{ provide: IneOcrService, useValue: ocr }] }).compileComponents();
    fixture = TestBed.createComponent(DatosMovilizador);
    componente = fixture.componentInstance;
    fixture.componentRef.setInput('ficha', { ...fichaEnlaceVacia(), celular: '0000000000', facebook: 'Perfil manual' });
    fixture.componentRef.setInput('colonias', [{ nombre: 'CENTRO', secciones: [1028], activo: true, municipio: 'Tuxtepec' }]);
    fixture.detectChanges();
    componente.imagenFrente = 'data:image/jpeg;base64,cHJ1ZWJh';
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('rellena los datos detectados y conserva celular y Facebook', async () => {
    const nombre = vi.spyOn(componente.nombreDetectado, 'emit');
    ocr.leerIne.mockResolvedValue({ ok: true, texto: '', datos: { nombreCompleto: 'Persona de prueba', direccion: 'Calle de prueba C.P. 00001', colonia: 'Centro', claveElector: 'prueba123456789000', curp: 'prueba123456789001', seccion: 1028 } });
    await componente.leerFrente();
    expect(nombre).toHaveBeenCalledWith('Persona de prueba');
    expect(componente.ficha).toMatchObject({ domicilio: 'Calle de prueba C.P. 00001', colonia: 'CENTRO', codigoPostal: '00001', claveElector: 'PRUEBA123456789000', curp: 'PRUEBA123456789001', seccion: 1028, celular: '0000000000', facebook: 'Perfil manual' });
    expect(componente.ficha.ineFrente).toBe('');
    expect(componente.procesando).toBe(false);
  });

  it('conserva campos ya capturados cuando la lectura no los detecta', async () => {
    componente.ficha.domicilio = 'Domicilio manual';
    componente.ficha.curp = 'PRUEBA123456789000';
    ocr.leerIne.mockResolvedValue({ ok: true, texto: '', datos: {} });
    await componente.leerFrente();
    expect(componente.ficha.domicilio).toBe('Domicilio manual');
    expect(componente.ficha.curp).toBe('PRUEBA123456789000');
    expect(componente.mensaje).toContain('No se detectaron');
  });

  it('permite reintentar después de un fallo de red sin perder la foto', async () => {
    ocr.leerIne.mockRejectedValueOnce(new Error('Sin conexión'));
    await componente.leerFrente();
    expect(componente.mensaje).toContain('No se pudo leer');
    expect(componente.imagenFrente).toContain('data:image/jpeg');
    ocr.leerIne.mockResolvedValue({ ok: true, texto: 'C.P. 00001', datos: {} });
    await componente.leerFrente();
    expect(componente.ficha.codigoPostal).toBe('00001');
  });

  it('no llama al servicio sin internet y libera el bloqueo del formulario', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const estado = vi.spyOn(componente.procesandoChange, 'emit');
    await componente.leerFrente();
    expect(ocr.leerIne).not.toHaveBeenCalled();
    expect(componente.mensaje).toContain('Necesitas internet');
    expect(estado).toHaveBeenLastCalledWith(false);
  });

  it('descarta resultados pendientes al cambiar de movilizador', async () => {
    let resolver!: (dato: unknown) => void;
    ocr.leerIne.mockReturnValue(new Promise((resolve) => { resolver = resolve; }));
    const nombre = vi.spyOn(componente.nombreDetectado, 'emit');
    const pendiente = componente.leerFrente();
    fixture.componentRef.setInput('ficha', fichaEnlaceVacia());
    fixture.detectChanges();
    resolver({ ok: true, datos: { nombreCompleto: 'Persona anterior', direccion: 'Domicilio anterior' } });
    await pendiente;
    expect(componente.ficha.domicilio).toBe('');
    expect(nombre).not.toHaveBeenCalled();
    expect(componente.imagenFrente).toBe('');
  });

  it('prepara una foto del frente y ejecuta la lectura automáticamente', async () => {
    vi.spyOn(TestBed.inject(RecorteIneService), 'editar').mockResolvedValue(new Blob(['recorte'], { type: 'image/jpeg' }));
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 1600, height: 1000, close: vi.fn() }));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,aW1hZ2Vu');
    ocr.leerIne.mockResolvedValue({ ok: true, texto: '', datos: { curp: 'PRUEBA123456789000' } });
    await componente.cargarFrente({ target: { files: [new File(['foto'], 'ine.jpg', { type: 'image/jpeg' })], value: 'ine.jpg' } } as unknown as Event);
    expect(ocr.leerIne).toHaveBeenCalledWith('data:image/jpeg;base64,aW1hZ2Vu');
    expect(componente.ficha.curp).toBe('PRUEBA123456789000');
    expect(fixture.nativeElement.querySelector('input[capture="environment"]')).toBeTruthy();
  });
});
