import { estilosCarta } from './carta';
import { UsuarioSistema, fichaEnlaceVacia } from '../models/usuario-sistema.model';

function escapar(valor: unknown): string {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function crearBoletaEnlaceHtml(usuario: UsuarioSistema): string {
  if (usuario.rol !== 'enlace') throw new Error('La boleta corresponde a un usuario enlace.');
  const ficha = { ...fichaEnlaceVacia(), ...usuario.fichaRegistro };
  const campo = (etiqueta: string, valor: unknown) => `<div class="campo"><div class="etiqueta">${escapar(etiqueta)}:</div><div class="valor">${escapar(valor)}</div></div>`;
  const imagen = (etiqueta: string, valor: string) => {
    // Solo imágenes locales JPEG/PNG: impide URLs remotas o contenido HTML/SVG.
    const segura = /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(valor);
    return `<div class="ine">${segura ? `<img src="${escapar(valor)}" alt="${escapar(etiqueta)}">` : `<span>${escapar(etiqueta)}</span>`}</div>`;
  };
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="formato-carta" content="portrait"><title>Formato de registro - ${escapar(usuario.nombre)}</title>
<style>
*{box-sizing:border-box}body{margin:0;background:white;color:#000;font-family:Arial,sans-serif;font-size:10pt;print-color-adjust:exact;-webkit-print-color-adjust:exact}.boleta{width:178mm;margin:0 auto}h1{width:107mm;min-height:13mm;margin:2mm auto 5mm;display:flex;align-items:center;justify-content:center;font-size:15pt}.campo,h1,.ine,.firma{background:#d9d9d9;border:1px solid #65233e;border-radius:3mm;box-shadow:0 0 2mm #777}.principales{display:grid;gap:4mm}.campo{min-height:15mm;padding:2.5mm 3.5mm;break-inside:avoid}.etiqueta{font-size:9pt}.valor{font-size:10pt;font-weight:600;line-height:1.15;overflow-wrap:anywhere;margin-top:1mm}.pares{display:grid;grid-template-columns:1fr 1fr;gap:3mm 10mm;margin-top:5mm}.imagenes{display:grid;grid-template-columns:1fr 1fr;gap:8mm;margin-top:6mm}.ine{height:54mm;border-radius:3mm;display:flex;align-items:center;justify-content:center;padding:0.6mm;overflow:hidden}.ine img{width:100%;height:100%;object-fit:contain;border-radius:1mm}.firma{width:82mm;height:20mm;margin:5mm auto 0;text-align:center;padding-top:3mm;break-inside:avoid}@media screen{body{padding:8mm 0}.boleta{max-width:100%}}

${estilosCarta('portrait')}
</style></head><body><main class="boleta"><h1>FORMATO DE REGISTRO:</h1><div class="principales">
${campo('NOMBRE DEL DELEGADO', usuario.delegadoNombre || usuario.seccionalNombre)}${campo('NOMBRE DEL ENLACE', usuario.nombre)}${campo('DOMICILIO', ficha.domicilio)}</div>
<div class="pares">${campo('COLONIA O LOCALIDAD', ficha.colonia)}${campo('C.P.', ficha.codigoPostal)}${campo('CLAVE DE ELECTOR', ficha.claveElector)}${campo('CURP', ficha.curp)}${campo('CELULAR', ficha.celular)}${campo('SECCIÓN ELECTORAL', ficha.seccion)}${campo('CORREO ELECTRÓNICO', usuario.correo)}${campo('FACEBOOK', ficha.facebook)}</div>
<div class="imagenes">${imagen('INE - FRENTE', ficha.ineFrente)}${imagen('INE - REVERSO', ficha.ineReverso)}</div><div class="firma">FIRMA:</div></main></body></html>`;
}
