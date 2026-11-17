export const TIPOS_CASILLA = [
  { valor: 'basica', nombre: 'Básica', codigo: 'B' },
  { valor: 'contigua', nombre: 'Contigua', codigo: 'C' },
  { valor: 'extraordinaria', nombre: 'Extraordinaria', codigo: 'E' },
  { valor: 'extraordinaria-contigua', nombre: 'Extraordinaria contigua', codigo: 'EC' },
  { valor: 'especial', nombre: 'Especial', codigo: 'S' },
] as const;

export type TipoCasilla = (typeof TIPOS_CASILLA)[number]['valor'];

export interface CasillaAsignada {
  tipo: TipoCasilla;
  numero: number;
  numeroContigua: number | null;
}

export interface SeccionAsignada {
  id: string;
  seccion: number;
  numeroRuta: number;
  casillas: CasillaAsignada[];
}

export interface FilaCasilla {
  clave: number;
  tipo: TipoCasilla;
  numero: number | null;
  numeroContigua: number | null;
}

export function nombreCasilla(
  casilla: Pick<CasillaAsignada, 'tipo' | 'numero' | 'numeroContigua'>,
): string {
  if (casilla.tipo === 'extraordinaria-contigua')
    return `E${casilla.numero} C${casilla.numeroContigua}`;
  const tipo = TIPOS_CASILLA.find((item) => item.valor === casilla.tipo);
  return `${tipo?.codigo || ''}${casilla.numero}`;
}

export function validarSeccionAsignada(
  seccion: number | null,
  numeroRuta: number | null,
  filas: FilaCasilla[],
): CasillaAsignada[] {
  if (!Number.isSafeInteger(seccion) || Number(seccion) <= 0)
    throw new Error('Captura un número de sección entero mayor que cero.');
  if (!Number.isSafeInteger(numeroRuta) || Number(numeroRuta) <= 0)
    throw new Error('Asigna un número de ruta entero mayor que cero a la sección.');
  if (!filas.length) throw new Error('Agrega al menos una casilla a la sección.');
  const identificadores = new Set<string>();
  return filas.map((fila, indice) => {
    const posicion = indice + 1;
    if (!TIPOS_CASILLA.some((tipo) => tipo.valor === fila.tipo))
      throw new Error(`Selecciona el tipo de la casilla ${posicion}.`);
    if (!Number.isSafeInteger(fila.numero) || Number(fila.numero) <= 0)
      throw new Error(`Captura un número válido para la casilla ${posicion}.`);
    if (
      fila.tipo === 'extraordinaria-contigua' &&
      (!Number.isSafeInteger(fila.numeroContigua) || Number(fila.numeroContigua) <= 0)
    )
      throw new Error(`Captura el número de contigua de la casilla ${posicion}.`);
    const casilla: CasillaAsignada = {
      tipo: fila.tipo,
      numero: fila.numero!,
      numeroContigua: fila.tipo === 'extraordinaria-contigua' ? fila.numeroContigua : null,
    };
    const identificador = nombreCasilla(casilla);
    if (identificadores.has(identificador))
      throw new Error(`La casilla ${identificador} está repetida en esta sección.`);
    identificadores.add(identificador);
    return casilla;
  });
}
