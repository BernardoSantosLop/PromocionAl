const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { normalizarFichaMovilizador } = require('../functions/ficha-movilizador');

function entorno(callerUid = 'delegado') {
  const perfiles = new Map([
    ['delegado', { nombre: 'Delegado de prueba', rol: 'seccional', activo: true }],
    ['propio', { nombre: 'Enlace propio', rol: 'enlace', activo: true, delegadoUid: 'delegado', seccionalUid: 'delegado' }],
    ['ajeno', { nombre: 'Enlace ajeno', rol: 'enlace', activo: true, delegadoUid: 'otro' }],
    ['movilizador', { nombre: 'Movilizador', rol: 'movilizador', activo: true, delegadoUid: 'delegado', enlaceUid: 'propio' }],
    ['coordinador', { nombre: 'Coordinador', rol: 'coordinador', activo: true }],
    ['mov-ajeno', { nombre: 'Otro movilizador', rol: 'movilizador', activo: true, enlaceUid: 'ajeno' }],
  ]);
  const votantes = new Map([
    ['asignado', { nombreCompleto: 'Persona asignada', movilizadorUid: 'movilizador', capturadoPorUid: 'movilizador', curp: 'NO-EXPORTAR', telefono: '0000000000', direccion: 'Domicilio de prueba', seccion: 1028 }],
    ['sin-asignacion', { nombreCompleto: 'Persona capturada', capturadoPorUid: 'movilizador' }],
    ['reasignado', { nombreCompleto: 'Persona reasignada', capturadoPorUid: 'movilizador', movilizadorUid: 'mov-ajeno' }],
  ]);
  const documento = (id) => ({ id, exists: perfiles.has(id), data: () => perfiles.get(id) });
  const coleccion = {
    doc: (id) => ({ get: async () => documento(id), set: async (datos) => perfiles.set(id, { ...perfiles.get(id), ...datos }) }),
    where: (campo, operador, valor) => ({ get: async () => ({ docs: [...perfiles.keys()].filter((id) => perfiles.get(id)[campo] === valor).map(documento) }) }),
  };
  class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const sandbox = { exports: {}, require: (nombre) => {
    if (nombre === 'firebase-functions/v2/https') return { onCall: (opciones, handler) => handler, HttpsError };
    if (nombre === 'firebase-admin/app') return { initializeApp() {} };
    if (nombre === 'firebase-admin/auth') return { getAuth() { throw new Error('No debe acceder a cuentas de otros usuarios.'); } };
    if (nombre === 'firebase-admin/firestore') return { getFirestore: () => ({ collection: (nombre) => nombre === 'votantes' ? { where: (campo, operador, valor) => ({ get: async () => ({ docs: [...votantes].filter(([id, datos]) => datos[campo] === valor).map(([id, datos]) => ({ id, data: () => datos })) }) }) } : coleccion }), FieldValue: { serverTimestamp: () => 'fecha' } };
    if (nombre === './ficha-movilizador') return { normalizarFichaMovilizador };
    throw new Error(nombre);
  } };
  vm.runInNewContext(fs.readFileSync('functions/administracion.js', 'utf8'), sandbox);
  return { perfiles, ejecutar: (data) => sandbox.exports.gestionarJerarquia({ auth: { uid: callerUid }, data }) };
}

test('el delegado crea enlaces y el servidor fuerza la asignación a su cuenta', async () => {
  const { ejecutar, perfiles } = entorno();
  await ejecutar({ accion: 'guardar', uid: 'nuevo', nombre: 'Nuevo enlace', correo: 'enlace@example.test', rol: 'enlace', responsableUid: 'otro' });
  assert.equal(perfiles.get('nuevo').delegadoUid, 'delegado');
  assert.equal(perfiles.get('nuevo').rol, 'enlace');
});
test('el delegado solo lista sus enlaces sin duplicados', async () => {
  const { ejecutar } = entorno();
  const respuesta = await ejecutar({ accion: 'listar' });
  assert.deepEqual(Array.from(respuesta.usuarios, (u) => u.uid), ['propio']);
});
test('guarda los datos y las imágenes de la ficha del enlace creado por el delegado', async () => {
  const { ejecutar, perfiles } = entorno();
  const fichaRegistro = { domicilio: 'Domicilio de prueba', colonia: 'CENTRO', codigoPostal: '00000', claveElector: 'PRUEBA123456789000', curp: 'PRUEBA123456789000', celular: '0000000000', seccion: 1028, facebook: '', ineFrente: 'data:image/jpeg;base64,cHJ1ZWJh', ineReverso: 'data:image/jpeg;base64,cHJ1ZWJh' };
  await ejecutar({ accion: 'guardar', uid: 'nuevo', nombre: 'Nuevo enlace', correo: 'enlace@example.test', rol: 'enlace', fichaRegistro });
  assert.equal(perfiles.get('nuevo').fichaRegistro.ineFrente, fichaRegistro.ineFrente);
  assert.equal(perfiles.get('nuevo').fichaRegistro.codigoPostal, '00000');
});
test('rechaza crear movilizadores, modificar enlaces ajenos y otras acciones administrativas', async () => {
  const { ejecutar } = entorno();
  const base = { accion: 'guardar', uid: 'nuevo', nombre: 'Prueba', correo: 'prueba@example.test', rol: 'enlace' };
  for (const datos of [{ ...base, rol: 'movilizador' }, { ...base, uid: 'ajeno' }, { accion: 'asignarCuentaSinPerfil' }, { accion: 'recuperarMovilizador' }]) await assert.rejects(ejecutar(datos), { code: 'permission-denied' });
});
test('el enlace solo obtiene personas de sus movilizadores, sin duplicados ni CURP', async () => {
  const { ejecutar } = entorno('propio');
  const respuesta = await ejecutar({ accion: 'listarSimpatizantes', movilizadorUid: 'movilizador' });
  assert.deepEqual(Array.from(respuesta.simpatizantes, (p) => p.id).sort(), ['asignado', 'sin-asignacion']);
  assert.equal(respuesta.simpatizantes.find((p) => p.id === 'asignado').telefono, '0000000000');
  assert.ok(respuesta.simpatizantes.every((p) => !Object.hasOwn(p, 'curp')));
  await assert.rejects(ejecutar({ accion: 'listarSimpatizantes', movilizadorUid: 'mov-ajeno' }), { code: 'permission-denied' });
});
test('el coordinador puede preparar las listas y el delegado no obtiene datos por esa acción', async () => {
  assert.equal((await entorno('coordinador').ejecutar({ accion: 'listarSimpatizantes', movilizadorUid: 'movilizador' })).simpatizantes.length, 2);
  await assert.rejects(entorno().ejecutar({ accion: 'listarSimpatizantes', movilizadorUid: 'movilizador' }), { code: 'permission-denied' });
});
