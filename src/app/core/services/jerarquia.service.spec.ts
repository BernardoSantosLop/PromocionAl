import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { FirebaseService } from '../firebase/firebase.service';
import { JerarquiaService } from './jerarquia.service';

describe('Creación de cuentas sin cambiar la sesión', () => {
  let service: JerarquiaService;
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    TestBed.configureTestingModule({ providers: [{ provide: FirebaseService, useValue: {} }] });
    service = TestBed.inject(JerarquiaService);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('solicita únicamente el UID, sin iniciar sesión como la cuenta nueva', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ localId: 'nuevo' }) });
    expect(await service.crearCuenta(' NUEVO@example.test ', 'prueba123')).toBe('nuevo');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({
      email: 'nuevo@example.test',
      password: 'prueba123',
      returnSecureToken: false,
    });
  });

  it('conserva EMAIL_EXISTS para poder recuperar la cuenta', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: 'EMAIL_EXISTS' } }),
    });
    await expect(service.crearCuenta('existente@example.test', 'prueba123')).rejects.toMatchObject({
      code: 'EMAIL_EXISTS',
    });
  });

  it('no envía contraseñas inválidas al servidor', async () => {
    await expect(service.crearCuenta('nuevo@example.test', '123')).rejects.toThrow('6 caracteres');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
