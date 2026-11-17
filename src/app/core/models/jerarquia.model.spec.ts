import { construirArbolJerarquia, filtrarArbolJerarquia } from './jerarquia.model';
import { UsuarioSistema } from './usuario-sistema.model';

describe('Jerarquía recuperada con enlaces', () => {
  const usuarios = [
    { uid: 'c', nombre: 'Coordinador', rol: 'coordinador', activo: true },
    { uid: 'd', nombre: 'Delegado', rol: 'seccional', activo: true, coordinadorUid: 'c' },
    { uid: 'e', nombre: 'Enlace', rol: 'enlace', activo: true, seccionalUid: 'd' },
    {
      uid: 'm',
      nombre: 'María',
      rol: 'movilizador',
      activo: true,
      enlaceUid: 'e',
      seccionalUid: 'd',
    },
    { uid: 'legacy', nombre: 'Sin enlace', rol: 'movilizador', activo: true, seccionalUid: 'd' },
    { uid: 'inactivo', nombre: 'Inactivo', rol: 'movilizador', activo: false, enlaceUid: 'e' },
  ] as UsuarioSistema[];

  it('incluye enlaces y conserva movilizadores anteriores sin duplicarlos', () => {
    const arbol = construirArbolJerarquia(usuarios, { m: 7, legacy: 2 }, 'coordinador');
    const delegado = arbol[0].hijos[0];
    expect(delegado.hijos.map((nodo) => nodo.usuario.uid)).toEqual(['e', 'legacy']);
    expect(delegado.hijos[0].hijos.map((nodo) => nodo.usuario.uid)).toEqual(['m']);
    expect(delegado.hijos[0].hijos[0].totalSimpatizantes).toBe(7);
  });

  it('buscar sin acentos conserva la rama hasta el resultado', () => {
    const arbol = construirArbolJerarquia(usuarios, {}, 'coordinador');
    const filtrado = filtrarArbolJerarquia(arbol, 'maria');
    expect(filtrado[0].hijos[0].hijos[0].hijos[0].usuario.uid).toBe('m');
    expect(filtrado[0].hijos[0].hijos).toHaveLength(1);
  });

  it('construye la vista del enlace con sus movilizadores', () => {
    const propios = usuarios.filter((usuario) => usuario.uid === 'e' || usuario.enlaceUid === 'e');
    const arbol = construirArbolJerarquia(propios, { m: 3 }, 'enlace');
    expect(arbol.map((nodo) => nodo.usuario.uid)).toEqual(['e']);
    expect(arbol[0].hijos).toHaveLength(1);
    expect(arbol[0].hijos[0].totalSimpatizantes).toBe(3);
  });
});
