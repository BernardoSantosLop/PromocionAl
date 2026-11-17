import { estilosCarta } from './carta';
import { UsuarioSistema, fichaEnlaceVacia } from '../models/usuario-sistema.model';

const escapar = (valor: unknown) => String(valor ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function agruparMovilizadores(usuarios: UsuarioSistema[], enlaceUid: string): UsuarioSistema[][] {
  const lista = usuarios.filter((u) => u.rol === 'movilizador' && u.enlaceUid === enlaceUid).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es') || a.uid.localeCompare(b.uid));
  return Array.from({ length: Math.ceil(lista.length / 5) }, (_, i) => lista.slice(i * 5, i * 5 + 5));
}

export function crearBoletaMovilizadoresHtml(enlace: UsuarioSistema, movilizadores: UsuarioSistema[], inicio = 1): string {
  if (enlace.rol !== 'enlace' || !movilizadores.length || movilizadores.some((m) => m.rol !== 'movilizador' || m.enlaceUid !== enlace.uid) || new Set(movilizadores.map((m) => m.uid)).size !== movilizadores.length) throw new Error('Selecciona movilizadores del mismo enlace para imprimir.');
  const campo = (etiqueta: string, valor: unknown) => `<span class="dato"><span>${etiqueta}:</span><b>${escapar(valor)}</b></span>`;
  const bloque = (usuario: UsuarioSistema | undefined, numero: number) => {
    const ficha = { ...fichaEnlaceVacia(), ...usuario?.fichaRegistro };
    return `<article class="movilizador"><div>${campo(`NOMBRE DEL MOVILIZADOR ${numero}`, usuario?.nombre)}</div><div>${campo('DOMICILIO', ficha.domicilio)}</div><div class="par">${campo('COLONIA O LOCALIDAD', ficha.colonia)}${campo('C.P.', ficha.codigoPostal)}</div><div>${campo('CLAVE DE ELECTOR', ficha.claveElector)}</div><div>${campo('CURP', ficha.curp)}</div><div class="par">${campo('CELULAR', ficha.celular)}${campo('SECCIÓN', ficha.seccion)}</div><div class="par">${campo('CORREO', usuario?.correo)}${campo('FACEBOOK', ficha.facebook)}</div></article>`;
  };
  const paginas = Array.from({ length: Math.ceil(movilizadores.length / 5) }, (_, pagina) => `<section class="hoja"><h1>FORMATO DE REGISTRO:</h1><header>${campo('NOMBRE DEL ENLACE', enlace.nombre)}</header><div class="bloques">${Array.from({ length: 5 }, (_, i) => bloque(movilizadores[pagina * 5 + i], inicio + pagina * 5 + i)).join('')}</div></section>`).join('');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="formato-carta" content="portrait"><title>Movilizadores - ${escapar(enlace.nombre)}</title><style>
*{box-sizing:border-box}body{margin:0;color:#000;font:9pt Arial,sans-serif;print-color-adjust:exact;-webkit-print-color-adjust:exact}.hoja{width:196mm;margin:0 auto;break-after:page}.hoja:last-child{break-after:auto}h1,header,.movilizador{background:#d9d9d9;border:1px solid #65233e;box-shadow:0 0 1.8mm #888}h1{width:108mm;margin:0 auto 4mm;padding:3mm;text-align:center;font-size:15pt;border-radius:3mm}header{min-height:16mm;height:auto;border-radius:3mm;padding:3mm;margin-bottom:4mm}.bloques{display:grid;gap:4mm}.movilizador{min-height:36mm;height:auto;border-radius:7mm;padding:3.4mm 4mm;break-inside:avoid;display:grid;grid-template-rows:repeat(7,auto)}.movilizador>div{min-height:0}.dato{display:flex;align-items:baseline;gap:1mm;min-width:0;white-space:nowrap;width:100%;line-height:1.15}.dato>span{flex-shrink:0}.dato b{font-weight:400;border-bottom:1px solid black;flex:1;min-width:0;white-space:normal;overflow-wrap:anywhere;font-size:8.5pt}.par{display:grid;grid-template-columns:1.1fr 1fr;gap:4mm}header .dato{white-space:normal}header b{border:0;font-weight:600}@media screen{body{padding:8mm 0;background:#eee}.hoja{background:white;padding:4mm;box-sizing:content-box;margin-bottom:10mm}}

${estilosCarta('portrait')}
</style></head><body>${paginas}</body></html>`;
}
