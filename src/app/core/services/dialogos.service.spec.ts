import { DialogosService } from './dialogos.service';

describe('Confirmaciones de la aplicación', () => {
  it('espera una respuesta y permite cancelar sin ejecutar la acción', async () => {
    const servicio = new DialogosService();
    const respuesta = servicio.confirmar('¿Eliminar este registro?');
    expect(servicio.actual()?.peligro).toBe(true);
    expect(servicio.actual()?.aceptar).toBe('Sí, eliminar');
    servicio.responder(false);
    expect(await respuesta).toBe(false);
    expect(servicio.actual()).toBeNull();
  });

  it('atiende solicitudes simultáneas en orden sin perder sus respuestas', async () => {
    const servicio = new DialogosService();
    const primera = servicio.confirmar('Cambiar ruta');
    const segunda = servicio.confirmar('Eliminar registro');
    expect(servicio.actual()?.mensaje).toBe('Cambiar ruta');
    servicio.responder(true);
    expect(await primera).toBe(true);
    expect(servicio.actual()?.mensaje).toBe('Eliminar registro');
    servicio.responder(false);
    expect(await segunda).toBe(false);
    expect(servicio.actual()).toBeNull();
  });

  it('distingue los avisos informativos de las acciones destructivas', async () => {
    const servicio = new DialogosService();
    const respuesta = servicio.avisar('No hay teléfonos para exportar.');
    expect(servicio.actual()?.informativo).toBe(true);
    expect(servicio.actual()?.peligro).toBe(false);
    expect(servicio.actual()?.aceptar).toBe('Entendido');
    servicio.responder(true);
    expect(await respuesta).toBe(true);
  });

  it('ignora un segundo clic sobre la misma acción pendiente', async () => {
    const servicio = new DialogosService();
    const primera = servicio.confirmar('Eliminar registro');
    expect(await servicio.confirmar('Eliminar registro')).toBe(false);
    servicio.responder(true);
    expect(await primera).toBe(true);
    expect(servicio.actual()).toBeNull();
  });
});
