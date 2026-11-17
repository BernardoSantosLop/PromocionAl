import { crearListaSimpatizantesHtml } from './lista-simpatizantes';
import { SimpatizanteJerarquia } from '../models/votante.model';
import { UsuarioSistema } from '../models/usuario-sistema.model';

describe('Lista de diez simpatizantes por movilizador', () => {
  const movilizador: UsuarioSistema = { uid: 'm', nombre: 'Movilizador de prueba', rol: 'movilizador', activo: true, correo: '', enlaceNombre: 'Enlace de prueba' };
  const personas = (cantidad: number): SimpatizanteJerarquia[] => Array.from({ length: cantidad }, (_, i) => ({ id: `p${i}`, nombreCompleto: `Persona ${String(i + 1).padStart(2, '0')}`, telefono: '0000000000', direccion: 'Domicilio de prueba', colonia: 'CENTRO', seccion: i % 2 ? 1029 : 1028, municipio: 'Tuxtepec', edad: 30, claveElector: 'PRUEBA123456789000', tieneFacebook: true, usuarioFacebook: 'Perfil de prueba' }));
  it.each([1, 10, 11, 20, 21])('imprime %i personas en grupos de diez sin perder ni repetir registros', (cantidad) => {
    const doc = new DOMParser().parseFromString(crearListaSimpatizantesHtml(movilizador, personas(cantidad)), 'text/html');
    expect(doc.querySelectorAll('.hoja')).toHaveLength(Math.ceil(cantidad / 10));
    expect(doc.querySelectorAll('.persona')).toHaveLength(Math.ceil(cantidad / 10) * 10);
    for (const persona of personas(cantidad)) expect(doc.body.textContent?.split(persona.nombreCompleto)).toHaveLength(2);
    expect(doc.body.textContent).toContain('Movilizador de prueba');
    expect(doc.body.textContent).toContain('Enlace de prueba');
    expect(doc.body.textContent).not.toMatch(/CURP|CORREO|C\.P\./);
    expect(doc.querySelector('style')?.textContent).toContain('letter landscape');
  });
  it('muestra la sección de las personas y no la sección de la credencial del movilizador', () => {
    const html = crearListaSimpatizantesHtml(movilizador, personas(10));
    expect(html).toContain('SECCIÓN: 1028, 1029');
  });
  it('rechaza listas vacías o repetidas y escapa el contenido', () => {
    expect(() => crearListaSimpatizantesHtml(movilizador, [])).toThrow();
    expect(() => crearListaSimpatizantesHtml(movilizador, [personas(1)[0], personas(1)[0]])).toThrow();
    const doc = new DOMParser().parseFromString(crearListaSimpatizantesHtml(movilizador, [{ ...personas(1)[0], nombreCompleto: '<script>1</script>' }]), 'text/html');
    expect(doc.querySelector('script')).toBeNull();
    expect(doc.body.textContent).toContain('<script>1</script>');
  });
});
