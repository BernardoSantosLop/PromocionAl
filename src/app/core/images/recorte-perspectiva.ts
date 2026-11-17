export interface PuntoRecorte { x: number; y: number; }
export type EsquinaRecorte = 'nw' | 'ne' | 'se' | 'sw';
export type EsquinasRecorte = Record<EsquinaRecorte, PuntoRecorte>;
export const ORDEN_ESQUINAS: EsquinaRecorte[] = ['nw', 'ne', 'se', 'sw'];

export function esquinasCompletas(): EsquinasRecorte {
  return { nw: { x: 0, y: 0 }, ne: { x: 100, y: 0 }, se: { x: 100, y: 100 }, sw: { x: 0, y: 100 } };
}

export function recorteValido(esquinas: EsquinasRecorte): boolean {
  const p = ORDEN_ESQUINAS.map((k) => esquinas[k]);
  return p.every((a, i) => {
    const b = p[(i + 1) % 4], c = p[(i + 2) % 4];
    return Number.isFinite(a.x) && Number.isFinite(a.y) && a.x >= 0 && a.x <= 100 && a.y >= 0 && a.y <= 100 &&
      (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) > .01 &&
      Math.hypot(b.x - a.x, b.y - a.y) >= 1;
  });
}

/** Map an upright output rectangle into the selected quadrilateral in the photo. */
export function transformacionPerspectiva(p: PuntoRecorte[]): (u: number, v: number) => PuntoRecorte {
  const [p0, p1, p2, p3] = p;
  const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x, dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y, dy2 = p3.y - p2.y, dy3 = p0.y - p1.y + p2.y - p3.y;
  const divisor = dx1 * dy2 - dx2 * dy1;
  const g = Math.abs(dx3) + Math.abs(dy3) < 1e-9 ? 0 : (dx3 * dy2 - dx2 * dy3) / divisor;
  const h = Math.abs(dx3) + Math.abs(dy3) < 1e-9 ? 0 : (dx1 * dy3 - dx3 * dy1) / divisor;
  const a = p1.x - p0.x + g * p1.x, b = p3.x - p0.x + h * p3.x;
  const d = p1.y - p0.y + g * p1.y, e = p3.y - p0.y + h * p3.y;
  return (u, v) => {
    const z = g * u + h * v + 1;
    return { x: (a * u + b * v + p0.x) / z, y: (d * u + e * v + p0.y) / z };
  };
}

export function recortarPerspectiva(origen: HTMLCanvasElement, esquinas: EsquinasRecorte): HTMLCanvasElement {
  if (!recorteValido(esquinas)) throw new Error('Ajusta las esquinas sin cruzarlas.');
  const puntos = ORDEN_ESQUINAS.map((k) => ({ x: esquinas[k].x * (origen.width - 1) / 100, y: esquinas[k].y * (origen.height - 1) / 100 }));
  const distancia = (a: number, b: number) => Math.hypot(puntos[a].x - puntos[b].x, puntos[a].y - puntos[b].y);
  const w = (distancia(0, 1) + distancia(3, 2)) / 2 + 1;
  const h = (distancia(0, 3) + distancia(1, 2)) / 2 + 1;
  const escala = Math.min(1, 1600 / Math.max(w, h));
  const salida = document.createElement('canvas');
  salida.width = Math.max(2, Math.round(w * escala));
  salida.height = Math.max(2, Math.round(h * escala));
  const ctx = salida.getContext('2d')!, fuente = origen.getContext('2d')!;
  const entrada = fuente.getImageData(0, 0, origen.width, origen.height);
  const imagen = ctx.createImageData(salida.width, salida.height);
  const convertir = transformacionPerspectiva(puntos);
  for (let y = 0; y < salida.height; y++) {
    for (let x = 0; x < salida.width; x++) {
      const p = convertir(x / (salida.width - 1), y / (salida.height - 1));
      const sx = Math.max(0, Math.min(origen.width - 1, p.x));
      const sy = Math.max(0, Math.min(origen.height - 1, p.y));
      const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0;
      const i00 = (y0 * origen.width + x0) * 4;
      const i10 = (y0 * origen.width + Math.min(x0 + 1, origen.width - 1)) * 4;
      const i01 = (Math.min(y0 + 1, origen.height - 1) * origen.width + x0) * 4;
      const i11 = (Math.min(y0 + 1, origen.height - 1) * origen.width + Math.min(x0 + 1, origen.width - 1)) * 4;
      const destino = (y * salida.width + x) * 4;
      for (let c = 0; c < 3; c++) imagen.data[destino + c] =
        entrada.data[i00 + c] * (1 - fx) * (1 - fy) + entrada.data[i10 + c] * fx * (1 - fy) +
        entrada.data[i01 + c] * (1 - fx) * fy + entrada.data[i11 + c] * fx * fy;
      imagen.data[destino + 3] = 255;
    }
  }
  ctx.putImageData(imagen, 0, 0);
  return salida;
}
