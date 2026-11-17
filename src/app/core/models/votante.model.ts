export interface SimpatizanteJerarquia {
  id: string;
  nombreCompleto: string;
  seccion: number;
  colonia: string;
  telefono?: string;
  direccion?: string;
  claveElector?: string;
  municipio?: string;
  edad?: number;
  tieneFacebook?: boolean;
  usuarioFacebook?: string;
}

export interface NuevoVotante {
  nombreCompleto: string;
  telefono: string;
  direccion: string;
  edad: number;
  claveElector: string;
  seccion: number;
  municipio: string;
  colonia: string;
  tieneFacebook: boolean;
  usuarioFacebook: string;
  activo: boolean;

  capturadoPorUid?: string;
  capturadoPorNombre?: string;
  capturadoPorRol?: string;
  movilizadorUid?: string;
  movilizadorNombre?: string;
  seccionalUid?: string;
  seccionalNombre?: string;
  asignadoPorUid?: string;
  asignadoPorNombre?: string;

  registradoSinConexion?: boolean;
  fechaRegistroLocal?: string;
}

export interface Votante extends NuevoVotante {
  id?: string;
  fechaRegistro?: Date | null;
  fechaActualizacion?: Date | null;

  pendienteSincronizacion?: boolean;
  desdeCache?: boolean;
}
