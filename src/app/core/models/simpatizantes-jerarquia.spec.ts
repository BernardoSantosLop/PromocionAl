import {
  seleccionarSimpatizantesDeMovilizador,
  RegistroSimpatizanteJerarquia,
} from './simpatizantes-jerarquia';

describe('Pertenencia de simpatizantes en la jerarquía', () => {
  const persona = (
    id: string,
    responsable: Partial<RegistroSimpatizanteJerarquia>,
  ): RegistroSimpatizanteJerarquia => ({
    id,
    nombreCompleto: id,
    seccion: 123,
    colonia: 'Centro',
    ...responsable,
  });

  it('combina asignados por un administrador y capturados sin duplicar personas', () => {
    const asignado = persona('Ana', { movilizadorUid: 'm', capturadoPorUid: 'admin' });
    const antiguo = persona('Beatriz', { capturadoPorUid: 'm' });
    const resultado = seleccionarSimpatizantesDeMovilizador('m', [asignado, antiguo, asignado]);
    expect(resultado.map((registro) => registro.id)).toEqual(['Ana', 'Beatriz']);
  });

  it('excluye registros reasignados aunque los haya capturado ese movilizador', () => {
    const resultado = seleccionarSimpatizantesDeMovilizador('m', [
      persona('Ajeno', { capturadoPorUid: 'm', movilizadorUid: 'otro' }),
      persona('Propio', { capturadoPorUid: 'otro', movilizadorUid: 'm' }),
    ]);
    expect(resultado.map((registro) => registro.id)).toEqual(['Propio']);
  });
});
