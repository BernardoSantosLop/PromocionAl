import { TestBed } from '@angular/core/testing';
import { RecorteIne } from './recorte-ine';
import { esquinasCompletas } from '../../../core/images/recorte-perspectiva';

describe('Esquinas independientes de INE', () => {
  it('mueve una esquina en ambos ejes sin mover las otras tres', () => {
    const editor = TestBed.createComponent(RecorteIne).componentInstance;
    editor.ajustarEsquina('nw', 20, 15);
    expect(editor.esquinas).toEqual({ ...esquinasCompletas(), nw: { x: 20, y: 15 } });
    editor.ajustarEsquina('se', 82, 90);
    expect(editor.esquinas.nw).toEqual({ x: 20, y: 15 });
    expect(editor.esquinas.ne).toEqual({ x: 100, y: 0 });
    expect(editor.esquinas.sw).toEqual({ x: 0, y: 100 });
    expect(editor.esquinas.se).toEqual({ x: 82, y: 90 });
  });
  it('evita cruzar las esquinas y permite restablecer toda la foto', () => {
    const editor = TestBed.createComponent(RecorteIne).componentInstance;
    editor.ajustarEsquina('nw', 20, 20);
    editor.ajustarEsquina('se', 5, 5);
    expect(editor.esquinas.se).toEqual({ x: 100, y: 100 });
    editor.restablecer();
    expect(editor.esquinas).toEqual(esquinasCompletas());
  });
  it('permite ajustar con teclado una sola esquina', () => {
    const editor = TestBed.createComponent(RecorteIne).componentInstance;
    editor.teclado(new KeyboardEvent('keydown', { key: 'ArrowLeft' }), 'ne');
    editor.teclado(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true }), 'ne');
    expect(editor.esquinas.ne).toEqual({ x: 99, y: 5 });
    expect(editor.esquinas.nw).toEqual({ x: 0, y: 0 });
    expect(editor.esquinas.se).toEqual({ x: 100, y: 100 });
  });
});
