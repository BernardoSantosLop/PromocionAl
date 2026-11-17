import { crearHojaRutaHtml } from './hoja-ruta';
import { RgCapturado, RutaElectoral, agruparRutasElectorales } from '../models/asignacion-rg.model';

describe('Hoja impresa de ruta', () => {
  it('imprime únicamente las casillas de la ruta elegida aunque la sección se repita', () => {
    const rutas = agruparRutasElectorales([
      { id: '1_1020', seccion: 1020, numeroRuta: 1, casillas: [{ tipo: 'basica', numero: 1, numeroContigua: null }] },
      { id: '3_1020', seccion: 1020, numeroRuta: 3, casillas: [{ tipo: 'contigua', numero: 1, numeroContigua: null }] },
    ]);
    const colonias = [{ nombre: 'El Castillo', municipio: 'Tuxtepec', activo: true, secciones: [1020] }];
    const filas = rutas.map((ruta) => {
      const html = crearHojaRutaHtml(ruta, { ...rg, numeroRutaAsignada: ruta.numeroRuta }, new Date(), colonias);
      return new DOMParser().parseFromString(html, 'text/html').querySelector('tbody tr')!;
    });
    expect(filas[0].children[0].textContent).toBe('1020');
    expect(filas[1].children[0].textContent).toBe('1020');
    expect(filas[0].children[1].textContent).toBe('El Castillo');
    expect(filas[1].children[1].textContent).toBe('El Castillo');
    expect(filas[0].children[2].textContent).toBe('B1');
    expect(filas[1].children[2].textContent).toBe('C1');
  });
  const rg: RgCapturado = {
    id: 'rg',
    nombreCompleto: 'Persona RG de prueba',
    telefono: '2871234567',
    seccion: 999,
    colonia: 'Centro',
    municipio: 'Tuxtepec',
    direccion: 'Calle de prueba 1',
    edad: 35,
    claveElector: 'PRUEBA123',
    numeroRutaAsignada: 1,
  };
  const ruta: RutaElectoral = {
    numeroRuta: 1,
    totalCasillas: 22,
    secciones: Array.from({ length: 11 }, (_, indice) => ({
      id: String(1000 + indice),
      seccion: 1000 + indice,
      numeroRuta: 1,
      casillas: [
        { tipo: 'basica', numero: 1, numeroContigua: null },
        { tipo: 'contigua', numero: 1, numeroContigua: null },
      ],
    })),
  };

  it('presenta cada sección frente a sus casillas en tres columnas', () => {
    const documento = new DOMParser().parseFromString(crearHojaRutaHtml(ruta, rg), 'text/html');
    const filas = documento.querySelectorAll('tbody tr');
    expect(filas).toHaveLength(11);
    expect(filas[0].querySelectorAll('td')).toHaveLength(3);
    expect(filas[0].children[0].textContent).toBe('1000');
    expect(filas[0].children[1].textContent).toBe('Sin colonia registrada');
    expect(filas[0].children[2].textContent).toBe('B1, C1');
    expect(documento.querySelector('.datos-rg')?.textContent).toContain('Persona RG de prueba');
    expect(documento.querySelector('.datos-rg')?.textContent).toContain('Calle de prueba 1');
    expect(documento.querySelector('.datos-rg')?.textContent).toContain('999');
    expect(documento.querySelector('tbody')?.textContent).not.toContain('999');
    expect(documento.querySelector('.resumen')?.textContent).toBe('11 secciones · 22 casillas');
  });

  it('imprime datos como texto sin ejecutar contenido HTML del registro', () => {
    const documento = new DOMParser().parseFromString(
      crearHojaRutaHtml(ruta, {
        ...rg,
        nombreCompleto: '<img src=x onerror=alert(1)>',
        direccion: 'A & B <C>',
      }),
      'text/html',
    );
    expect(documento.querySelector('img')).toBeNull();
    expect(documento.querySelector('script')).toBeNull();
    expect(documento.querySelector('.datos-rg')?.textContent).toContain(
      '<img src=x onerror=alert(1)>',
    );
    expect(documento.querySelector('.datos-rg')?.textContent).toContain('A & B <C>');
  });

  it('relaciona las colonias con la secci?n y escapa sus nombres', () => {
    const documento = new DOMParser().parseFromString(crearHojaRutaHtml(ruta, rg, new Date(), [
      { nombre: 'El Castillo', municipio: 'Tuxtepec', activo: true, secciones: [1000] },
      { nombre: 'A & B <Centro>', municipio: 'Tuxtepec', activo: true, secciones: [1000, 1001] },
      { nombre: 'Otra secci?n', municipio: 'Tuxtepec', activo: true, secciones: [999] },
      { nombre: 'Inactiva', municipio: 'Tuxtepec', activo: false, secciones: [1000] },
    ]), 'text/html');
    const filas = documento.querySelectorAll('tbody tr');
    expect(filas[0].children[1].textContent).toBe('A & B <Centro>, El Castillo');
    expect(filas[1].children[1].textContent).toBe('A & B <Centro>');
    expect(filas[2].children[1].textContent).toBe('Sin colonia registrada');
    expect(documento.querySelector('tbody')?.textContent).not.toContain('Otra secci?n');
    expect(documento.querySelector('tbody')?.textContent).not.toContain('Inactiva');
    expect(documento.querySelector('centro')).toBeNull();
  });

  it('rechaza un RG que no corresponde a la ruta', () => {
    expect(() => crearHojaRutaHtml(ruta, { ...rg, numeroRutaAsignada: 2 })).toThrow(
      'no está asignado',
    );
  });

  it('no inventa datos que no estén registrados', () => {
    const documento = new DOMParser().parseFromString(
      crearHojaRutaHtml(ruta, { ...rg, direccion: '', municipio: '', edad: null }),
      'text/html',
    );
    expect(documento.querySelector('.datos-rg')?.textContent).toContain('No registrado');
  });
});
