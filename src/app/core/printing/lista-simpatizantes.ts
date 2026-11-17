import { estilosCarta } from './carta';
import { SimpatizanteJerarquia } from '../models/votante.model';
import { UsuarioSistema } from '../models/usuario-sistema.model';

const escapar = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function crearListaSimpatizantesHtml(movilizador: UsuarioSistema, personas: SimpatizanteJerarquia[]): string {
  if (movilizador.rol !== 'movilizador' || !personas.length || new Set(personas.map((p) => p.id)).size !== personas.length) throw new Error('Selecciona un movilizador con simpatizantes registrados.');
  const dato = (etiqueta: string, valor: unknown) => `<span class="dato"><span>${etiqueta}:</span><b>${escapar(valor)}</b></span>`;
  const fila = (p: SimpatizanteJerarquia | undefined, numero: number) => `<article class="persona"><div class="numero">${numero}</div><div class="campos"><div class="dos nombre">${dato('NOMBRE', p?.nombreCompleto)}${dato('CELULAR', p?.telefono)}</div><div class="dos">${dato('DOMICILIO', p?.direccion)}${dato('COLONIA O LOCALIDAD', p?.colonia)}</div><div class="tres">${dato('CLAVE DE ELECTOR', p?.claveElector)}${dato('EDAD', p?.edad || '')}${dato('SECCIÓN', p?.seccion || '')}</div><div class="dos">${dato('MUNICIPIO', p?.municipio)}${dato('FACEBOOK', p?.tieneFacebook ? p.usuarioFacebook || 'Sí' : p ? 'No' : '')}</div></div></article>`;
  const paginas = Array.from({ length: Math.ceil(personas.length / 10) }, (_, pagina) => {
    const lista = personas.slice(pagina * 10, pagina * 10 + 10);
    const secciones = [...new Set(lista.map((p) => p.seccion).filter(Boolean))].sort((a, b) => a - b).join(', ');
    return `<section class="hoja"><header><h1>FORMATO DE PERSONAS CONVENCIDAS</h1><div class="secciones">SECCIÓN: ${escapar(secciones)}</div></header><div class="responsable">MOVILIZADOR: <strong>${escapar(movilizador.nombre)}</strong>${movilizador.enlaceNombre ? ` · ENLACE: ${escapar(movilizador.enlaceNombre)}` : ''} · HOJA ${pagina + 1} DE ${Math.ceil(personas.length / 10)}</div>${Array.from({ length: 10 }, (_, i) => fila(lista[i], pagina * 10 + i + 1)).join('')}</section>`;
  }).join('');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="formato-carta" content="landscape"><title>Simpatizantes de ${escapar(movilizador.nombre)}</title><style>
*{box-sizing:border-box}body{margin:0;color:black;font:8pt Arial,sans-serif;print-color-adjust:exact;-webkit-print-color-adjust:exact}.hoja{width:265mm;margin:auto;break-after:page}.hoja:last-child{break-after:auto}header{display:flex;align-items:center;justify-content:center;gap:20mm;min-height:12mm;height:auto}h1,.secciones{border:1px solid #65233e;background:#d9d9d9;border-radius:2mm;box-shadow:0 0 1.5mm #888;padding:2mm;margin:0}h1{font-size:12pt}.secciones{font-size:9pt;max-width:85mm}.responsable{min-height:8mm;height:auto;padding-top:2mm;font-size:8pt}.persona{min-height:16mm;height:auto;border-bottom:1px solid #65233e;display:grid;grid-template-columns:12mm 1fr;gap:3mm;padding:1.5mm 0;break-inside:avoid}.numero{width:11mm;height:13mm;border:1mm solid #65233e;border-radius:2mm;display:flex;align-items:center;justify-content:center;font-size:10pt}.campos{display:grid;grid-template-rows:repeat(4,1fr);min-width:0}.dos,.tres{display:grid;gap:3mm;min-width:0}.dos{grid-template-columns:1fr 1fr}.nombre{grid-template-columns:1.6fr 1fr}.tres{grid-template-columns:1.5fr .5fr .8fr}.dato{display:flex;gap:1mm;align-items:baseline;min-width:0;line-height:1.05}.dato>span{white-space:nowrap;flex-shrink:0}.dato b{font-weight:400;border-bottom:1px solid black;flex:1;min-width:0;overflow-wrap:anywhere;font-size:7.5pt}@media screen{body{padding:8mm;background:#eee}.hoja{background:white;margin-bottom:10mm;padding:3mm;box-sizing:content-box}}

${estilosCarta('landscape')}
</style></head><body>${paginas}</body></html>`;
}
