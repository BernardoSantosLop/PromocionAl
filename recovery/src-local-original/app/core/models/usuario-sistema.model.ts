export type RolUsuario = 'coordinador' | 'seccional' | 'movilizador';

export interface UsuarioSistema {
  uid: string;
  nombre: string;
  correo: string;
  rol: RolUsuario;
  activo: boolean;

  coordinadorUid?: string;
  coordinadorNombre?: string;

  seccionalUid?: string;
  seccionalNombre?: string;
}