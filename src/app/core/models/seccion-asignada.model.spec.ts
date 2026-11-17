import { FilaCasilla, nombreCasilla, validarSeccionAsignada } from './seccion-asignada.model';

describe('Registro de secciones y casillas por ruta', () => {
  const fila = (datos: Partial<FilaCasilla> = {}): FilaCasilla => ({
    clave: 1,
    tipo: 'basica',
    numero: 1,
    numeroContigua: null,
    ...datos,
  });

  it('valida las casillas de una sección con una sola ruta', () => {
    const casillas = validarSeccionAsignada(123, 1, [fila(), fila({ clave: 2, tipo: 'contigua' })]);
    expect(casillas.map(nombreCasilla)).toEqual(['B1', 'C1']);
    expect(casillas[0]).not.toHaveProperty('clave');
    expect(casillas[0]).not.toHaveProperty('numeroRuta');
  });

  it('rechaza casillas repetidas en una sección', () => {
    expect(() => validarSeccionAsignada(123, 1, [fila(), fila()])).toThrow('repetida');
  });

  it.each([null, 0, -1, 1.5, Number.NaN])('rechaza secciones y rutas no válidas: %s', (numero) => {
    expect(() => validarSeccionAsignada(numero, 1, [fila()])).toThrow('sección');
    expect(() => validarSeccionAsignada(123, numero, [fila()])).toThrow('ruta');
  });

  it('distingue extraordinarias contiguas por ambos números', () => {
    const casillas = validarSeccionAsignada(123, 1, [
      fila({ tipo: 'extraordinaria-contigua', numero: 1, numeroContigua: 1 }),
      fila({ tipo: 'extraordinaria-contigua', numero: 2, numeroContigua: 1 }),
    ]);
    expect(casillas.map(nombreCasilla)).toEqual(['E1 C1', 'E2 C1']);
    expect(() =>
      validarSeccionAsignada(123, 1, [fila({ tipo: 'extraordinaria-contigua' })]),
    ).toThrow('contigua');
  });

  it('exige una casilla y limpia los números de contigua que no aplican', () => {
    expect(() => validarSeccionAsignada(123, 1, [])).toThrow('al menos una');
    expect(
      validarSeccionAsignada(123, 1, [fila({ numeroContigua: 7 })])[0].numeroContigua,
    ).toBeNull();
  });
});
