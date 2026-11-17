import { RecorteIneService } from './recorte-ine.service';

describe('Edición de fotos de INE', () => {
  const foto = new Blob(['foto'], { type: 'image/jpeg' });
  it('entrega solo la foto recortada que se confirma', async () => {
    const servicio = new RecorteIneService();
    const pendiente = servicio.editar(foto);
    const recorte = new Blob(['foto recortada'], { type: 'image/jpeg' });
    expect(servicio.solicitud()?.origen).toBe(foto);
    servicio.terminar(recorte);
    expect(await pendiente).toBe(recorte);
    expect(servicio.solicitud()).toBeNull();
  });
  it('cancelar no devuelve una foto ni modifica el archivo original', async () => {
    const servicio = new RecorteIneService();
    const pendiente = servicio.editar(foto);
    servicio.terminar(null);
    expect(await pendiente).toBeNull();
    expect(foto.size).toBe(4);
  });
  it('no reemplaza una edición que todavía está abierta', async () => {
    const servicio = new RecorteIneService();
    const pendiente = servicio.editar(foto);
    expect(await servicio.editar(foto)).toBeNull();
    servicio.terminar(null);
    await pendiente;
  });
  it('rechaza archivos no admitidos antes de abrir el editor', async () => {
    const servicio = new RecorteIneService();
    await expect(servicio.editar(new Blob(['texto'], { type: 'text/plain' }))).rejects.toThrow('imagen JPG');
    await expect(servicio.editar('https://example.com/foto.jpg')).rejects.toThrow('no es válida');
    expect(servicio.solicitud()).toBeNull();
  });
});
