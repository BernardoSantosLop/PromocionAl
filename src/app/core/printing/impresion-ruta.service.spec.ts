import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ImpresionRutaService } from './impresion-ruta.service';

describe('Impresión aislada de la hoja de ruta', () => {
  let servicio: ImpresionRutaService;
  beforeEach(() => {
    servicio = TestBed.inject(ImpresionRutaService);
  });
  afterEach(() => {
    servicio.limpiar();
    vi.restoreAllMocks();
  });

  it('imprime solo el documento de la ruta y lo retira al cerrar la impresión', async () => {
    servicio.imprimir('<!doctype html><html><body>Ruta de prueba</body></html>');
    const frame = document.querySelector('iframe')!;
    expect(frame.srcdoc).toContain('Ruta de prueba');
    const imprimir = vi.spyOn(frame.contentWindow!, 'print').mockImplementation(() => {});
    vi.spyOn(frame.contentWindow!, 'focus').mockImplementation(() => {});
    frame.dispatchEvent(new Event('load'));
    await Promise.resolve();
    await Promise.resolve();
    await vi.waitFor(() => expect(imprimir).toHaveBeenCalledTimes(1));
    frame.contentWindow!.dispatchEvent(new Event('afterprint'));
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('no conserva hojas anteriores al preparar otra impresión', () => {
    servicio.imprimir('<html><body>Primera ruta</body></html>');
    const anterior = document.querySelector('iframe')!;
    vi.spyOn(anterior.contentWindow!, 'print').mockImplementation(() => {});
    vi.spyOn(anterior.contentWindow!, 'focus').mockImplementation(() => {});
    servicio.imprimir('<html><body>Segunda ruta</body></html>');
    const actual = document.querySelector('iframe')!;
    vi.spyOn(actual.contentWindow!, 'print').mockImplementation(() => {});
    vi.spyOn(actual.contentWindow!, 'focus').mockImplementation(() => {});
    expect(anterior.isConnected).toBe(false);
    expect(document.querySelectorAll('iframe')).toHaveLength(1);
    expect(document.querySelector('iframe')?.srcdoc).toContain('Segunda ruta');
  });

  it('espera a que se carguen las fuentes antes de imprimir', async () => {
    servicio.imprimir('<html><body>Formato carta</body></html>');
    const frame = document.querySelector('iframe')!;
    let cargar!: () => void;
    const lista = new Promise<void>((resolve) => { cargar = resolve; });
    Object.defineProperty(frame.contentWindow!.document, 'fonts', { configurable: true, value: { ready: lista } });
    const imprimir = vi.spyOn(frame.contentWindow!, 'print').mockImplementation(() => {});
    vi.spyOn(frame.contentWindow!, 'focus').mockImplementation(() => {});
    frame.dispatchEvent(new Event('load'));
    await Promise.resolve();
    expect(imprimir).not.toHaveBeenCalled();
    cargar();
    await Promise.resolve();
    await Promise.resolve();
    await vi.waitFor(() => expect(imprimir).toHaveBeenCalledTimes(1));
  });

  it('no imprime un formato cancelado mientras esperaba los recursos', async () => {
    servicio.imprimir('<html><body>Formato anterior</body></html>');
    const frame = document.querySelector('iframe')!;
    let cargar!: () => void;
    const lista = new Promise<void>((resolve) => { cargar = resolve; });
    Object.defineProperty(frame.contentWindow!.document, 'fonts', { configurable: true, value: { ready: lista } });
    const imprimir = vi.spyOn(frame.contentWindow!, 'print').mockImplementation(() => {});
    frame.dispatchEvent(new Event('load'));
    servicio.limpiar();
    cargar();
    await Promise.resolve();
    await Promise.resolve();
    expect(imprimir).not.toHaveBeenCalled();
  });
});
