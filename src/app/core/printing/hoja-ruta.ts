import { Colonia } from '../models/colonia.model';
import { RgCapturado, RutaElectoral } from '../models/asignacion-rg.model';
import { nombreCasilla } from '../models/seccion-asignada.model';

function escapar(valor: unknown): string {
  return String(valor ?? '').replace(
    /[&<>"']/g,
    (caracter) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[caracter]!,
  );
}

export function crearHojaRutaHtml(
  ruta: RutaElectoral,
  rg: RgCapturado,
  fecha = new Date(),
  colonias: Colonia[] = [],
): string {
  if (rg.numeroRutaAsignada !== ruta.numeroRuta)
    throw new Error('El RG no está asignado a esta ruta.');
  if (!ruta.secciones.length) throw new Error('Esta ruta no tiene secciones para imprimir.');
  const valor = (dato: unknown) =>
    escapar(
      dato === null || dato === undefined || String(dato).trim() === '' ? 'No registrado' : dato,
    );
  const dato = (etiqueta: string, contenido: unknown, ancho = false) =>
    `<div class="dato${ancho ? ' ancho' : ''}"><dt>${escapar(etiqueta)}</dt><dd>${valor(contenido)}</dd></div>`;
  const totalCasillas = ruta.secciones.reduce(
    (total, seccion) => total + seccion.casillas.length,
    0,
  );
  const coloniasPorSeccion = new Map<number, Set<string>>();
  for (const colonia of colonias) {
    if (!colonia.activo || !colonia.nombre.trim()) continue;
    for (const seccion of colonia.secciones || []) {
      const nombres = coloniasPorSeccion.get(Number(seccion)) || new Set<string>();
      nombres.add(colonia.nombre.trim());
      coloniasPorSeccion.set(Number(seccion), nombres);
    }
  }
  const filas = ruta.secciones
    .map(
      (seccion) =>
        `<tr><td>${escapar(seccion.seccion)}</td><td>${escapar([...(coloniasPorSeccion.get(seccion.seccion) || [])].sort((a, b) => a.localeCompare(b, 'es')).join(', ') || 'Sin colonia registrada')}</td><td>${seccion.casillas.map((casilla) => escapar(nombreCasilla(casilla))).join(', ') || 'Sin casillas registradas'}</td></tr>`,
    )
    .join('');
  const fechaTexto = new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeZone: 'America/Mexico_City',
  }).format(fecha);
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hoja de ruta ${escapar(ruta.numeroRuta)}</title>
<style>
@page{size:letter portrait;margin:14mm 16mm}
*{box-sizing:border-box}body{margin:0;color:#172033;background:#fff;font-family:Arial,sans-serif;font-size:10pt;line-height:1.35}
header{display:flex;align-items:flex-end;justify-content:space-between;gap:8mm;padding-bottom:5mm;border-bottom:1.5px solid #274c77}
.sistema{margin:0 0 2mm;color:#52677f;font-size:8pt;letter-spacing:1.3px;text-transform:uppercase}h1{margin:0;font-size:25pt;line-height:1.1;letter-spacing:-.5pt}.fecha{text-align:right;font-size:8pt;color:#64748b}.fecha span{display:block;margin-top:1mm}
.resumen{margin:4mm 0 6mm;font-size:9pt;color:#52677f}h2{margin:0 0 3mm;font-size:11pt;font-weight:700}.datos-rg{break-inside:avoid;margin-bottom:6mm}
dl{display:grid;grid-template-columns:1fr 1fr;gap:3mm 8mm;margin:0;padding:4mm 0;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0}.dato{min-width:0}.ancho{grid-column:1/-1}dt{margin-bottom:1mm;font-size:8pt;color:#64748b}dd{margin:0;font-size:10pt;overflow-wrap:anywhere}.nombre dd{font-size:12pt;font-weight:700}
.secciones{margin-top:5mm}table{width:150mm;max-width:100%;border-collapse:collapse;table-layout:fixed;font-size:10pt}col:first-child{width:25mm}col:nth-child(2){width:75mm}thead{display:table-header-group}th{text-align:left;color:#52677f;font-size:8pt;font-weight:600;padding:2mm 0 3mm}th,td{padding-left:5mm;padding-right:5mm}th:first-child,td:first-child{text-align:center}th:not(:last-child),td:not(:last-child){border-right:1px solid #3b82f6}td{height:7mm;padding-top:1.6mm;padding-bottom:1.6mm;vertical-align:top;overflow-wrap:anywhere}tr{break-inside:avoid}h2{break-after:avoid}.nota{margin:6mm 0 0;font-size:8pt;color:#64748b}
@media screen{body{max-width:184mm;margin:10mm auto;padding:0 4mm}}
</style></head><body>
<header><div><p class="sistema">Control Electoral · Hoja de ruta</p><h1>Ruta ${escapar(ruta.numeroRuta)}</h1></div><div class="fecha">Fecha de impresión<span>${escapar(fechaTexto)}</span></div></header>
<p class="resumen">${ruta.secciones.length} ${ruta.secciones.length === 1 ? 'sección' : 'secciones'} · ${totalCasillas} ${totalCasillas === 1 ? 'casilla' : 'casillas'}</p>
<section class="datos-rg"><h2>RG asignado</h2><dl>
<div class="dato ancho nombre"><dt>Nombre completo</dt><dd>${valor(rg.nombreCompleto)}</dd></div>
${dato('Teléfono', rg.telefono)}${dato('Clave de elector', rg.claveElector)}${dato('Dirección', rg.direccion, true)}${dato('Colonia', rg.colonia)}${dato('Municipio', rg.municipio)}${dato('Edad', rg.edad)}${dato('Sección de su credencial', rg.seccion || null)}${rg.tieneFacebook ? dato('Facebook', rg.usuarioFacebook, true) : ''}
</dl></section>
<section class="secciones"><h2>Secciones y casillas de la ruta</h2><table aria-label="Secciones electorales, colonias y casillas"><colgroup><col><col><col></colgroup><thead><tr><th scope="col">Sección</th><th scope="col">Colonia</th><th scope="col">Casillas</th></tr></thead><tbody>${filas}</tbody></table></section>
</body></html>`;
}
