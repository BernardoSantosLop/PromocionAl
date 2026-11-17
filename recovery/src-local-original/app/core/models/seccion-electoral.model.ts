export interface SeccionElectoral {
  id?: string;
  seccion: number;
  municipio: string;
  colonia: string;
  activo: boolean;
}

export interface ResumenDistrito {
  nombre: string;
  total: number;
  color: string;
}