import { esquinasCompletas, recorteValido, transformacionPerspectiva } from './recorte-perspectiva';

describe('Recorte con perspectiva', () => {
  it('mantiene los ejes de una foto rectangular sin girarla ni reflejarla', () => {
    const convertir = transformacionPerspectiva([{ x: 0, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 900 }, { x: 0, y: 900 }]);
    expect(convertir(0, 0)).toEqual({ x: 0, y: 0 });
    expect(convertir(1, 0)).toEqual({ x: 600, y: 0 });
    expect(convertir(0, 1)).toEqual({ x: 0, y: 900 });
    expect(convertir(.5, .5)).toEqual({ x: 300, y: 450 });
  });
  it('lleva cada esquina de salida al punto elegido en un cuadrilátero inclinado', () => {
    const puntos = [{ x: 120, y: 80 }, { x: 910, y: 140 }, { x: 780, y: 640 }, { x: 70, y: 570 }];
    const convertir = transformacionPerspectiva(puntos);
    [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(([u, v], i) => {
      expect(convertir(u, v).x).toBeCloseTo(puntos[i].x);
      expect(convertir(u, v).y).toBeCloseTo(puntos[i].y);
    });
    const medio = convertir(.5, .5);
    expect(medio.x).toBeGreaterThan(120);
    expect(medio.x).toBeLessThan(780);
    expect(medio.y).toBeGreaterThan(140);
    expect(medio.y).toBeLessThan(570);
  });
  it('rechaza selecciones cruzadas, degeneradas o fuera de la foto', () => {
    expect(recorteValido(esquinasCompletas())).toBe(true);
    expect(recorteValido({ ...esquinasCompletas(), nw: { x: 100, y: 100 } })).toBe(false);
    expect(recorteValido({ ...esquinasCompletas(), ne: { x: -5, y: 10 } })).toBe(false);
    expect(recorteValido({ ...esquinasCompletas(), ne: { x: NaN, y: 0 } })).toBe(false);
  });
});
