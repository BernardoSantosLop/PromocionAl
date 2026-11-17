import { SeccionAsignada } from './seccion-asignada.model';

export interface RgCapturado {
  id: string;
  nombreCompleto: string;
  telefono: string;
  seccion: number;
  colonia: string;
  claveElector: string;
  numeroRutaAsignada: number | null;
  direccion?: string;
  municipio?: string;
  edad?: number | null;
  tieneFacebook?: boolean;
  usuarioFacebook?: string;
}

export interface RutaElectoral {
  numeroRuta: number;
  secciones: SeccionAsignada[];
  totalCasillas: number;
}

export function numeroRutaValido(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  if (typeof valor !== 'number' && typeof valor !== 'string') return null;
  const numero = Number(valor);
  return Number.isSafeInteger(numero) && numero > 0 ? numero : null;
}

export function agruparRutasElectorales(secciones: SeccionAsignada[]): RutaElectoral[] {
  const grupos = new Map<number, SeccionAsignada[]>();
  for (const seccion of secciones) {
    const numeroRuta = numeroRutaValido(seccion.numeroRuta);
    if (numeroRuta === null) continue;
    const grupo = grupos.get(numeroRuta) || [];
    grupo.push(seccion);
    grupos.set(numeroRuta, grupo);
  }
  return [...grupos.entries()]
    .sort(([a], [b]) => a - b)
    .map(([numeroRuta, grupo]) => ({
      numeroRuta,
      secciones: [...grupo].sort((a, b) => a.seccion - b.seccion),
      totalCasillas: grupo.reduce((total, seccion) => total + seccion.casillas.length, 0),
    }));
}
