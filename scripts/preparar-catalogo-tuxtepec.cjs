const fs = require('node:fs');
const XLSX = require('xlsx');

const archivo = process.argv[2];
if (!archivo) throw new Error('Indica la ruta del Excel de colonias y localidades.');
const libro = XLSX.readFile(archivo);
const filas = XLSX.utils.sheet_to_json(libro.Sheets[libro.SheetNames[0]], { header: 1, defval: '' });
const cabecera = filas.findIndex((fila) => fila[0] === 'TIPO' && fila[1] === 'NOMBRE' && fila[2] === 'SECCIONES');
if (cabecera < 0) throw new Error('No se encontró la cabecera TIPO, NOMBRE, SECCIONES.');
const normalizar = (texto) => texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const municipio = 'San Juan Bautista Tuxtepec';
const ids = new Set();
const colonias = filas.slice(cabecera + 1).filter((fila) => fila.some(Boolean)).map((fila, indice) => {
  const [tipo, nombre, valor] = fila.map((celda) => String(celda).trim());
  const secciones = [...new Set(valor.split(',').map((seccion) => Number(seccion.trim())))].sort((a, b) => a - b);
  if (!['COLONIA', 'LOCALIDAD'].includes(tipo) || !nombre || !secciones.length || secciones.some((n) => !Number.isInteger(n) || n <= 0)) {
    throw new Error(`Fila ${cabecera + indice + 2}: datos inválidos.`);
  }
  let id = normalizar(`${municipio}-${nombre}`);
  if (ids.has(id)) id += `-${tipo.toLowerCase()}`;
  if (ids.has(id)) throw new Error(`Registro duplicado: ${tipo} ${nombre}`);
  ids.add(id);
  return { id, tipo, nombre, secciones, municipio, activo: true };
});
const numeros = [...new Set(colonias.flatMap((colonia) => colonia.secciones))].sort((a, b) => a - b);
const secciones = numeros.map((seccion) => ({
  id: String(seccion), seccion, municipio, activo: true,
  colonia: colonias.filter((colonia) => colonia.secciones.includes(seccion)).map((colonia) => `${colonia.tipo === 'LOCALIDAD' ? 'Localidad' : 'Colonia'}: ${colonia.nombre}`).join('; '),
}));
const catalogo = { fuente: archivo.split(/[\\/]/).pop(), colonias, secciones };
fs.mkdirSync('data', { recursive: true });
fs.writeFileSync('data/catalogo-tuxtepec.json', JSON.stringify(catalogo, null, 2) + '\n');
console.log(JSON.stringify({ colonias: colonias.filter((c) => c.tipo === 'COLONIA').length, localidades: colonias.filter((c) => c.tipo === 'LOCALIDAD').length, secciones: secciones.length, relaciones: colonias.reduce((n, c) => n + c.secciones.length, 0) }));
