export type RolUsuario = 'coordinador' | 'seccional' | 'enlace' | 'movilizador';

export interface FichaRegistroEnlace {
  domicilio: string;
  colonia: string;
  codigoPostal: string;
  claveElector: string;
  curp: string;
  celular: string;
  seccion: number | null;
  facebook: string;
  ineFrente: string;
  ineReverso: string;
}

export function fichaEnlaceVacia(): FichaRegistroEnlace {
  return { domicilio: '', colonia: '', codigoPostal: '', claveElector: '', curp: '', celular: '', seccion: null, facebook: '', ineFrente: '', ineReverso: '' };
}

export function validarFichaMovilizador(ficha: FichaRegistroEnlace): string {
  if (!ficha.domicilio.trim() || !ficha.colonia.trim()) return 'Captura domicilio y colonia o localidad del movilizador.';
  if (!/^\d{5}$/.test(ficha.codigoPostal)) return 'El código postal debe tener 5 dígitos.';
  if (!/^[A-Z0-9]{18}$/i.test(ficha.claveElector.trim())) return 'La clave de elector debe tener 18 caracteres.';
  if (!/^[A-Z0-9]{18}$/i.test(ficha.curp.trim())) return 'La CURP debe tener 18 caracteres.';
  if (!/^\d{10}$/.test(ficha.celular)) return 'El celular debe tener 10 dígitos.';
  if (!Number.isInteger(Number(ficha.seccion)) || Number(ficha.seccion) <= 0) return 'Captura una sección electoral válida.';
  return '';
}

export interface UsuarioSistema {
  uid: string;
  nombre: string;
  correo: string;
  rol: RolUsuario;
  activo: boolean;
  fichaRegistro?: FichaRegistroEnlace;

  coordinadorUid?: string;
  coordinadorNombre?: string;

  seccionalUid?: string;
  seccionalNombre?: string;
  delegadoUid?: string;
  delegadoNombre?: string;
  enlaceUid?: string;
  enlaceNombre?: string;
}

export const NOMBRES_ROL: Record<RolUsuario, string> = {
  coordinador: 'Coordinador',
  seccional: 'Delegado',
  enlace: 'Enlace',
  movilizador: 'Movilizador',
};
