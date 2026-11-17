export interface Colonia {
  id?: string;
  nombre: string;
  municipio: string;
  activo: boolean;
  tipo?: 'COLONIA' | 'LOCALIDAD';
  secciones?: number[];
}
