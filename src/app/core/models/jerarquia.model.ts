import { UsuarioSistema, NOMBRES_ROL, RolUsuario } from './usuario-sistema.model';

export interface NodoJerarquia {
  usuario: UsuarioSistema;
  etiqueta: string;
  totalSimpatizantes?: number;
  hijos: NodoJerarquia[];
}

export function construirArbolJerarquia(
  usuarios: UsuarioSistema[],
  conteos: Record<string, number>,
  rolSolicitante: RolUsuario,
): NodoJerarquia[] {
  const activos = usuarios.filter((usuario) => usuario.activo);
  const movilizadores = activos.filter((usuario) => usuario.rol === 'movilizador');
  const movilizador = (usuario: UsuarioSistema): NodoJerarquia => ({
    usuario,
    etiqueta: NOMBRES_ROL.movilizador,
    totalSimpatizantes: conteos[usuario.uid] || 0,
    hijos: [],
  });
  const enlace = (usuario: UsuarioSistema): NodoJerarquia => ({
    usuario,
    etiqueta: NOMBRES_ROL.enlace,
    hijos: movilizadores.filter((item) => item.enlaceUid === usuario.uid).map(movilizador),
  });
  if (rolSolicitante === 'enlace') {
    return activos.filter((usuario) => usuario.rol === 'enlace').map(enlace);
  }
  return activos
    .filter((usuario) => usuario.rol === 'coordinador')
    .map((coordinador) => ({
      usuario: coordinador,
      etiqueta: NOMBRES_ROL.coordinador,
      hijos: activos
        .filter(
          (usuario) =>
            usuario.rol === 'seccional' &&
            (!usuario.coordinadorUid || usuario.coordinadorUid === coordinador.uid),
        )
        .map((delegado) => ({
          usuario: delegado,
          etiqueta: NOMBRES_ROL.seccional,
          hijos: [
            ...activos
              .filter(
                (usuario) =>
                  usuario.rol === 'enlace' &&
                  (usuario.seccionalUid === delegado.uid || usuario.delegadoUid === delegado.uid),
              )
              .map(enlace),
            ...movilizadores
              .filter((usuario) => !usuario.enlaceUid && usuario.seccionalUid === delegado.uid)
              .map(movilizador),
          ],
        })),
    }));
}

export function filtrarArbolJerarquia(nodos: NodoJerarquia[], busqueda: string): NodoJerarquia[] {
  const normalizar = (texto: string) =>
    texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  const texto = normalizar(busqueda);
  if (!texto) return nodos;
  return nodos.flatMap((nodo) => {
    if (normalizar(nodo.usuario.nombre).includes(texto)) return [nodo];
    const hijos = filtrarArbolJerarquia(nodo.hijos, busqueda);
    return hijos.length ? [{ ...nodo, hijos }] : [];
  });
}
