import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ControlElectoralService } from './control-electoral.service';
import { FirebaseService } from '../firebase/firebase.service';

const mock = vi.hoisted(() => ({
  documentos: new Map<string, Record<string, unknown>>(),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  onSnapshot: vi.fn(),
  doc: (_db: unknown, _coleccion: string, id: string) => ({ id }),
  serverTimestamp: () => 'fecha-servidor',
  deleteDoc: async (ref: { id: string }) => { mock.documentos.delete(ref.id); },
  runTransaction: async (_db: unknown, ejecutar: (transaccion: unknown) => Promise<void>) => ejecutar({
    get: async (ref: { id: string }) => ({
      exists: () => mock.documentos.has(ref.id),
      data: () => mock.documentos.get(ref.id),
    }),
    set: (ref: { id: string }, datos: Record<string, unknown>) => mock.documentos.set(ref.id, datos),
    update: (ref: { id: string }, datos: Record<string, unknown>) => mock.documentos.set(ref.id, { ...mock.documentos.get(ref.id), ...datos }),
    delete: (ref: { id: string }) => mock.documentos.delete(ref.id),
  }),
}));

describe('Secciones compartidas entre rutas', () => {
  let servicio: ControlElectoralService;
  const basica = [{ clave: 1, tipo: 'basica' as const, numero: 1, numeroContigua: null }];
  const contigua = [{ clave: 1, tipo: 'contigua' as const, numero: 1, numeroContigua: null }];

  beforeEach(() => {
    mock.documentos.clear();
    TestBed.configureTestingModule({ providers: [{
      provide: FirebaseService,
      useValue: { obtenerFirestore: () => ({}), obtenerAuth: () => ({ currentUser: { uid: 'coordinador' } }) },
    }] });
    servicio = TestBed.inject(ControlElectoralService);
  });

  it('guarda 1020 B1 en ruta 1 y 1020 C1 en ruta 3 como registros independientes', async () => {
    await servicio.guardarSeccion(1020, 1, basica);
    await servicio.guardarSeccion(1020, 3, contigua);
    expect(mock.documentos.size).toBe(2);
    expect(mock.documentos.get('1_1020')).toMatchObject({ seccion: 1020, numeroRuta: 1, casillas: [expect.objectContaining({ tipo: 'basica' })] });
    expect(mock.documentos.get('3_1020')).toMatchObject({ seccion: 1020, numeroRuta: 3, casillas: [expect.objectContaining({ tipo: 'contigua' })] });
  });

  it('agrega casillas diferentes a la misma sección dentro de la misma ruta', async () => {
    await servicio.guardarSeccion(1020, 1, basica);
    await servicio.guardarSeccion(1020, 1, contigua);
    expect(mock.documentos.size).toBe(1);
    expect(mock.documentos.get('1_1020')?.['casillas']).toEqual([
      expect.objectContaining({ tipo: 'basica', numero: 1 }),
      expect.objectContaining({ tipo: 'contigua', numero: 1 }),
    ]);
    await expect(servicio.guardarSeccion(1020, 1, basica)).rejects.toThrow('La casilla B1 ya está registrada');
    expect(mock.documentos.get('1_1020')?.['casillas']).toHaveLength(2);
  });

  it('permite otra ruta aunque exista un registro del formato anterior', async () => {
    mock.documentos.set('1020', { seccion: 1020, numeroRuta: 1, casillas: basica });
    await servicio.guardarSeccion(1020, 3, contigua);
    expect(mock.documentos.get('1020')?.['numeroRuta']).toBe(1);
    expect(mock.documentos.get('3_1020')?.['numeroRuta']).toBe(3);
    await servicio.guardarSeccion(1020, 1, contigua);
    expect(mock.documentos.get('1020')?.['casillas']).toHaveLength(2);
    expect(mock.documentos.has('1_1020')).toBe(false);
    await expect(servicio.guardarSeccion(1020, 1, basica)).rejects.toThrow('ya está registrada');
  });

  it('edita un registro anterior conservando su auditoría y las otras rutas', async () => {
    mock.documentos.set('1020', { seccion: 1020, numeroRuta: 1, creadoPorUid: 'autor-original', fechaRegistro: 'fecha-original' });
    await servicio.guardarSeccion(1020, 3, contigua);
    await servicio.guardarSeccion(1020, 1, basica, '1020');
    expect(mock.documentos.has('1020')).toBe(false);
    expect(mock.documentos.get('1_1020')).toMatchObject({ creadoPorUid: 'autor-original', fechaRegistro: 'fecha-original', actualizadoPorUid: 'coordinador' });
    expect(mock.documentos.get('3_1020')?.['numeroRuta']).toBe(3);
  });

  it('cambia de ruta sin dejar duplicado y permite editar de nuevo', async () => {
    await servicio.guardarSeccion(1020, 1, basica);
    await servicio.guardarSeccion(1020, 3, contigua, '1_1020');
    expect(mock.documentos.has('1_1020')).toBe(false);
    await servicio.guardarSeccion(1020, 3, basica, '3_1020');
    expect(mock.documentos.size).toBe(1);
    expect(mock.documentos.get('3_1020')?.['casillas']).toEqual([expect.objectContaining({ tipo: 'basica' })]);
  });

  it('impide mover un registro a una ruta donde esa sección ya existe', async () => {
    await servicio.guardarSeccion(1020, 1, basica);
    await servicio.guardarSeccion(1020, 3, contigua);
    await expect(servicio.guardarSeccion(1020, 3, basica, '1_1020')).rejects.toThrow('en esta ruta');
    expect(mock.documentos.size).toBe(2);
    mock.documentos.set('1020', { seccion: 1020, numeroRuta: 5 });
    await expect(servicio.guardarSeccion(1020, 5, basica, '1_1020')).rejects.toThrow('en esta ruta');
    expect(mock.documentos.has('1_1020')).toBe(true);
  });

  it('rechaza cambios de sección o registros eliminados mientras se editaba', async () => {
    await servicio.guardarSeccion(1020, 1, basica);
    await expect(servicio.guardarSeccion(1050, 1, basica, '1_1020')).rejects.toThrow('no se puede cambiar');
    await expect(servicio.guardarSeccion(1020, 1, basica, 'registro-eliminado')).rejects.toThrow('ya no existe');
    expect(mock.documentos.size).toBe(1);
  });

  it('elimina solo la asignación de la ruta elegida', async () => {
    await servicio.guardarSeccion(1020, 1, basica);
    await servicio.guardarSeccion(1020, 3, contigua);
    await servicio.eliminarSeccion('1_1020');
    expect(mock.documentos.has('1_1020')).toBe(false);
    expect(mock.documentos.has('3_1020')).toBe(true);
  });
});
