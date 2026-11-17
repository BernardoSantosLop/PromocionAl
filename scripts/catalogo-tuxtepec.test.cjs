const { test } = require('node:test');
const assert = require('node:assert/strict');
const catalogo = require('../data/catalogo-tuxtepec.json');

test('conserva todos los asentamientos y relaciones del Excel', () => {
  assert.equal(catalogo.colonias.length, 217);
  assert.equal(catalogo.colonias.filter((c) => c.tipo === 'COLONIA').length, 141);
  assert.equal(catalogo.colonias.filter((c) => c.tipo === 'LOCALIDAD').length, 76);
  assert.equal(catalogo.secciones.length, 81);
  assert.equal(catalogo.colonias.reduce((n, c) => n + c.secciones.length, 0), 239);
  assert.equal(new Set(catalogo.colonias.map((c) => c.id)).size, 217);
  for (const colonia of catalogo.colonias) {
    for (const numero of colonia.secciones) {
      assert.ok(catalogo.secciones.find((s) => s.seccion === numero)?.colonia.includes(colonia.nombre));
    }
  }
});
test('mantiene varias secciones y distingue colonia de localidad con nombres similares', () => {
  assert.deepEqual(catalogo.colonias.find((c) => c.nombre === 'SANTA FE').secciones, [1012, 1016, 1017]);
  const colonia = catalogo.colonias.find((c) => c.nombre === 'LA UNIÓN');
  const localidad = catalogo.colonias.find((c) => c.nombre === 'LA UNION');
  assert.notEqual(colonia.id, localidad.id);
  assert.deepEqual(colonia.secciones, [1018]);
  assert.deepEqual(localidad.secciones, [1076]);
});
