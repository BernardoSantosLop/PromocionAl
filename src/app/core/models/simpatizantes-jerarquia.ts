import { SimpatizanteJerarquia } from './votante.model';

export interface RegistroSimpatizanteJerarquia extends SimpatizanteJerarquia {
  movilizadorUid?: string;
  capturadoPorUid?: string;
}

export function seleccionarSimpatizantesDeMovilizador(
  uid: string,
  registros: RegistroSimpatizanteJerarquia[],
): SimpatizanteJerarquia[] {
  const unicos = new Map<string, SimpatizanteJerarquia>();
  for (const registro of registros) {
    // Una reasignación tiene prioridad sobre el capturista original.
    if ((registro.movilizadorUid || registro.capturadoPorUid) !== uid) continue;
    const { id, nombreCompleto, seccion, colonia } = registro;
    unicos.set(id, { id, nombreCompleto, seccion, colonia });
  }
  return [...unicos.values()].sort((a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto));
}
