import { crearBoletaEnlaceHtml } from './boleta-enlace';
import { UsuarioSistema, fichaEnlaceVacia } from '../models/usuario-sistema.model';

describe('Boleta de registro de enlace', () => {
  const usuario: UsuarioSistema = {
    uid: 'prueba', nombre: 'Enlace de prueba', correo: 'enlace@example.test', rol: 'enlace', activo: true,
    delegadoNombre: 'Delegado de prueba', fichaRegistro: {
      ...fichaEnlaceVacia(), domicilio: 'Domicilio de prueba', colonia: 'CENTRO', codigoPostal: '00000',
      claveElector: 'PRUEBA123456789000', curp: 'PRUEBA123456789000', celular: '0000000000', seccion: 1028,
      facebook: 'Perfil de prueba', ineFrente: 'data:image/jpeg;base64,cHJ1ZWJh', ineReverso: 'data:image/jpeg;base64,cHJ1ZWJh',
    },
  };
  it('rellena los campos y las dos imágenes y conserva la firma vacía', () => {
    const documento = new DOMParser().parseFromString(crearBoletaEnlaceHtml(usuario), 'text/html');
    expect(documento.querySelectorAll('.campo')).toHaveLength(11);
    expect(documento.querySelectorAll('.ine img')).toHaveLength(2);
    for (const valor of ['Delegado de prueba', 'Enlace de prueba', 'Domicilio de prueba', 'CENTRO', '00000', '1028', 'enlace@example.test', 'Perfil de prueba']) expect(documento.body.textContent).toContain(valor);
    expect(documento.querySelector('.firma')?.textContent).toBe('FIRMA:');
    expect(documento.querySelector('style')?.textContent).toContain('size:letter portrait');
  });
  it('escapa los datos y bloquea imágenes remotas o contenido ejecutable', () => {
    const html = crearBoletaEnlaceHtml({ ...usuario, nombre: '<script>alert(1)</script>', fichaRegistro: { ...usuario.fichaRegistro!, ineFrente: 'https://example.test/imagen.jpg', ineReverso: 'data:image/svg+xml;base64,AAA' } });
    const documento = new DOMParser().parseFromString(html, 'text/html');
    expect(documento.querySelector('script')).toBeNull();
    expect(documento.querySelectorAll('img')).toHaveLength(0);
    expect(documento.body.textContent).toContain('<script>alert(1)</script>');
  });
  it('admite imprimir enlaces anteriores con espacios para completar', () => {
    expect(crearBoletaEnlaceHtml({ ...usuario, fichaRegistro: undefined })).toContain('INE - REVERSO');
  });
});
