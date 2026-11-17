import { agruparRutasElectorales, numeroRutaValido } from './asignacion-rg.model';
import { SeccionAsignada } from './seccion-asignada.model';

describe('Rutas disponibles para asignar a RG', () => {
  it('agrupa once secciones como una ruta y conserva todas sus casillas', () => {
    const secciones: SeccionAsignada[] = Array.from({ length: 11 }, (_, indice) => ({
      id: String(100 + indice),
      seccion: 100 + indice,
      numeroRuta: 1,
      casillas: [
        { tipo: 'basica', numero: 1, numeroContigua: null },
        { tipo: 'contigua', numero: 1, numeroContigua: null },
      ],
    }));
    const rutas = agruparRutasElectorales(secciones.reverse());
    expect(rutas).toHaveLength(1);
    expect(rutas[0].totalCasillas).toBe(22);
    expect(rutas[0].secciones[0].seccion).toBe(100);
    expect(rutas[0].secciones).toHaveLength(11);
  });
  it.each([null, undefined, '', 'incorrecto', 0, -1, 1.5, true])(
    'no ofrece números de ruta inválidos: %s',
    (valor) => {
      expect(numeroRutaValido(valor)).toBeNull();
    },
  );
});
