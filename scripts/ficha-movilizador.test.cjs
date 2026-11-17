const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizarFichaMovilizador } = require('../functions/ficha-movilizador');
const ficha = { domicilio: 'Calle de prueba', colonia: 'CENTRO', codigoPostal: '00000', claveElector: 'prueba123456789000', curp: 'prueba123456789000', celular: '0000000000', seccion: 1028, facebook: '' };
test('normaliza la ficha sin perder ceros iniciales y excluye campos adicionales', () => {
  const resultado = normalizarFichaMovilizador({ ...ficha, enlaceUid: 'otro', ineFrente: 'imagen' });
  assert.equal(resultado.codigoPostal, '00000');
  assert.equal(resultado.curp, 'PRUEBA123456789000');
  assert.equal(resultado.ineFrente, '');
  assert.equal(resultado.enlaceUid, undefined);
});
test('rechaza datos incompletos o demasiado largos sin truncar identificadores', () => {
  for (const modificacion of [{ domicilio: '' }, { codigoPostal: '000000' }, { curp: 'PRUEBA123456789000EXTRA' }, { seccion: 1.5 }, { celular: '123' }]) assert.throws(() => normalizarFichaMovilizador({ ...ficha, ...modificacion }));
});
