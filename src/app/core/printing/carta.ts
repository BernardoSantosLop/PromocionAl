export type OrientacionCarta = 'portrait' | 'landscape';

export function estilosCarta(orientacion: OrientacionCarta): string {
  const ancho = orientacion === 'landscape' ? 258 : 194;
  return `@page{size:letter ${orientacion};margin:10mm}
  .hoja{width:${ancho}mm;max-width:100%;break-inside:avoid;break-after:page}
  .hoja:last-child{break-after:auto}
  @media print{html,body{margin:0;padding:0;background:#fff}.hoja,.boleta{padding:0;box-sizing:border-box;margin:0 auto;box-shadow:none}.hoja{width:${ancho}mm}.boleta{break-inside:avoid}}`;
}

/** Fit each logical sheet separately, preserving all text instead of clipping it. */
export function ajustarHojasCarta(documento: Document): void {
  const orientacion = documento.querySelector('meta[name="formato-carta"]')?.getAttribute('content');
  if (orientacion !== 'portrait' && orientacion !== 'landscape') return;
  const ancho = orientacion === 'landscape' ? 258 : 194;
  const alto = orientacion === 'landscape' ? 193 : 257;
  const estilo = documento.createElement('style');
  estilo.textContent = `html{width:${ancho}mm}body{margin:0!important;padding:0!important;background:#fff!important}.hoja,.boleta{padding:0!important;margin:0 auto!important;box-sizing:border-box!important}.hoja{width:${ancho}mm!important}`;
  documento.head.appendChild(estilo);
  const pxPorMm = 96 / 25.4;
  documento.querySelectorAll<HTMLElement>('.hoja, .boleta').forEach((hoja) => {
    hoja.style.zoom = '1';
    let escala = 1;
    // Zoom can reflow wrapped text. Re-measure the resulting layout before printing.
    for (let intento = 0; intento < 12; intento++) {
      const rect = hoja.getBoundingClientRect();
      const factor = Math.min(1, ancho * pxPorMm / Math.max(rect.width, hoja.scrollWidth * escala, 1), alto * pxPorMm / Math.max(rect.height, hoja.scrollHeight * escala, 1));
      if (factor >= 1) break;
      escala = Math.floor(escala * factor * .995 * 10000) / 10000;
      hoja.style.zoom = String(escala);
    }
  });
}
