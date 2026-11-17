import { agruparMovilizadores, crearBoletaMovilizadoresHtml } from './boleta-movilizadores';
import { UsuarioSistema, fichaEnlaceVacia } from '../models/usuario-sistema.model';

describe('Formato de cinco movilizadores por enlace', () => {
  const enlace: UsuarioSistema = { uid: 'enlace', nombre: 'Enlace de prueba', rol: 'enlace', correo: '', activo: true };
  const lista = (cantidad: number): UsuarioSistema[] => Array.from({ length: cantidad }, (_, i) => ({ uid: `m${i}`, nombre: `Movilizador ${String(i + 1).padStart(2, '0')}`, rol: 'movilizador', enlaceUid: 'enlace', correo: 'prueba@example.test', activo: true, fichaRegistro: { ...fichaEnlaceVacia(), domicilio: 'Domicilio de prueba', codigoPostal: '00000', colonia: 'CENTRO', curp: 'PRUEBA123456789000', celular: '0000000000', seccion: 1028, claveElector: 'PRUEBA123456789000', facebook: 'Perfil' } }));
  it.each([1, 5, 6, 10, 11])('imprime %i movilizadores sin perder ni duplicar registros', (cantidad) => {
    const doc = new DOMParser().parseFromString(crearBoletaMovilizadoresHtml(enlace, lista(cantidad)), 'text/html');
    expect(doc.querySelectorAll('.hoja')).toHaveLength(Math.ceil(cantidad / 5));
    expect(doc.querySelectorAll('.movilizador')).toHaveLength(Math.ceil(cantidad / 5) * 5);
    for (const movilizador of lista(cantidad)) expect(doc.body.textContent?.split(movilizador.nombre)).toHaveLength(2);
    expect(doc.querySelectorAll('header')).toHaveLength(Math.ceil(cantidad / 5));
    expect(doc.body.textContent).toContain('00000');
  });
  it('permite imprimir una sola hoja con la numeración del grupo', () => {
    const grupos = agruparMovilizadores(lista(7), enlace.uid);
    const doc = new DOMParser().parseFromString(crearBoletaMovilizadoresHtml(enlace, grupos[1], 6), 'text/html');
    expect(doc.querySelectorAll('.hoja')).toHaveLength(1);
    expect(doc.body.textContent).toContain('NOMBRE DEL MOVILIZADOR 6');
    expect(doc.body.textContent).not.toContain('Movilizador 01');
  });
  it('rechaza mezclas de enlaces, listas vacías y registros repetidos', () => {
    expect(() => crearBoletaMovilizadoresHtml(enlace, [])).toThrow();
    expect(() => crearBoletaMovilizadoresHtml(enlace, [{ ...lista(1)[0], enlaceUid: 'otro' }])).toThrow();
    expect(() => crearBoletaMovilizadoresHtml(enlace, [lista(1)[0], lista(1)[0]])).toThrow();
  });
  it('escapa los datos personales al imprimir', () => {
    const doc = new DOMParser().parseFromString(crearBoletaMovilizadoresHtml({ ...enlace, nombre: '<script>1</script>' }, [{ ...lista(1)[0], nombre: '<img src=x onerror=alert(1)>' }]), 'text/html');
    expect(doc.querySelector('script, img')).toBeNull();
    expect(doc.body.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});
