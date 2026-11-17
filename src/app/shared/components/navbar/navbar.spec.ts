import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Navbar } from './navbar';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

describe('Navbar', () => {
  let component: Navbar;
  let fixture: ComponentFixture<Navbar>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Navbar],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { obtenerNombreLocal: () => 'Persona', obtenerRolLocal: () => 'enlace' },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Navbar);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('permite al enlace entrar a estructura sin mostrar opciones de coordinador', () => {
    const elemento: HTMLElement = fixture.nativeElement;
    expect(elemento.querySelector('a[href="/estructura"]')).toBeTruthy();
    expect(elemento.querySelector('a[href="/votantes"]')).toBeNull();
    expect(elemento.querySelector('a[href="/control-electoral"]')).toBeNull();
    expect(elemento.querySelector('.usuario-texto')?.textContent).toContain('Enlace');
  });

  it('muestra Control Electoral al coordinador', async () => {
    fixture.destroy();
    TestBed.inject(AuthService).obtenerRolLocal = () => 'coordinador';
    fixture = TestBed.createComponent(Navbar);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('a[href="/control-electoral"]')).toBeTruthy();
  });
});
