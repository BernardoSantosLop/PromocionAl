// Sin --aplicar solo consulta y respalda los dos catálogos actuales.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const catalogo = require('../data/catalogo-tuxtepec.json');

async function main() {
  const cliRequire = createRequire(path.join(process.env.APPDATA, 'npm/node_modules/firebase-tools/package.json'));
  const auth = cliRequire('./lib/auth');
  const cuenta = auth.getGlobalDefaultAccount();
  if (!cuenta) throw new Error('Inicia sesión con firebase login antes de continuar.');
  const token = await auth.getAccessToken(cuenta.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);
  const base = 'https://firestore.googleapis.com/v1/projects/promocion-al-voto/databases/(default)/documents';
  async function api(url, body) {
    const respuesta = await fetch(url, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const datos = await respuesta.json();
    if (!respuesta.ok) throw new Error(`Firestore ${respuesta.status}: ${datos.error?.message || 'Error'}`);
    return datos;
  }
  async function listar(nombre) {
    const documentos = [];
    let siguiente = '';
    do {
      const pagina = await api(`${base}/${nombre}?pageSize=1000${siguiente ? `&pageToken=${encodeURIComponent(siguiente)}` : ''}`);
      documentos.push(...(pagina.documents || []));
      siguiente = pagina.nextPageToken;
    } while (siguiente);
    return documentos;
  }
  const [colonias, secciones] = await Promise.all([listar('colonias'), listar('seccionesElectorales')]);
  fs.mkdirSync('tmp/catalogos', { recursive: true });
  const respaldo = `tmp/catalogos/respaldo-${Date.now()}.json`;
  fs.writeFileSync(respaldo, JSON.stringify({ colonias, secciones }, null, 2));
  console.log(JSON.stringify({ respaldo, actuales: { colonias: colonias.length, secciones: secciones.length }, nuevos: { asentamientos: catalogo.colonias.length, secciones: catalogo.secciones.length } }));
  if (!process.argv.includes('--aplicar')) return;
  const valor = (v) => typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? { integerValue: String(v) } : Array.isArray(v) ? { arrayValue: { values: v.map(valor) } } : { stringValue: v };
  const escrituras = [];
  for (const [coleccion, nuevos, anteriores] of [['colonias', catalogo.colonias, colonias], ['seccionesElectorales', catalogo.secciones, secciones]]) {
    const destinos = new Set(nuevos.map((r) => `${base.slice('https://firestore.googleapis.com/v1/'.length)}/${coleccion}/${r.id}`));
    for (const anterior of anteriores) if (!destinos.has(anterior.name)) escrituras.push({ delete: anterior.name, currentDocument: { updateTime: anterior.updateTime } });
    for (const { id, ...datos } of nuevos) {
      const nombre = `${base.slice('https://firestore.googleapis.com/v1/'.length)}/${coleccion}/${id}`;
      const anterior = anteriores.find((d) => d.name === nombre);
      escrituras.push({ update: { name: nombre, fields: { ...Object.fromEntries(Object.entries(datos).map(([k, v]) => [k, valor(v)])), fechaActualizacion: { timestampValue: new Date().toISOString() } } }, currentDocument: anterior ? { updateTime: anterior.updateTime } : { exists: false } });
    }
  }
  // Una sola operación atómica evita dejar una sustitución a medias.
  if (escrituras.length > 500) throw new Error('La sustitución supera 500 operaciones; requiere otra estrategia atómica.');
  await api(`${base}:commit`, { writes: escrituras });
  const [finalColonias, finalSecciones] = await Promise.all([listar('colonias'), listar('seccionesElectorales')]);
  if (finalColonias.length !== catalogo.colonias.length || finalSecciones.length !== catalogo.secciones.length) throw new Error('Los totales finales no coinciden.');
  for (const registro of catalogo.colonias) {
    const documento = finalColonias.find((d) => d.name.endsWith(`/${registro.id}`));
    const seccionesGuardadas = documento?.fields.secciones.arrayValue.values.map((v) => Number(v.integerValue));
    if (documento?.fields.nombre.stringValue !== registro.nombre || documento?.fields.tipo.stringValue !== registro.tipo || JSON.stringify(seccionesGuardadas) !== JSON.stringify(registro.secciones)) throw new Error(`Verificación fallida: ${registro.nombre}`);
  }
  console.log('Catálogos reemplazados y verificados: 217 asentamientos y 81 secciones.');
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
