import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from './core/services/auth.service';
import { vi } from 'vitest';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { obtenerNombreLocal: () => 'Persona', obtenerRolLocal: () => 'coordinador' },
        },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('muestra la navegación de la aplicación', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.logo')?.textContent).toContain('Promoción al Voto');
    expect(compiled.querySelector('router-outlet')).toBeTruthy();
  });

  it('oculta la navegación en el inicio de sesión', async () => {
    vi.spyOn(TestBed.inject(Router), 'url', 'get').mockReturnValue('/login');
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('app-navbar')).toBeNull();
  });
});
