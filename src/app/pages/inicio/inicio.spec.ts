import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Inicio } from './inicio';
import { of, BehaviorSubject, firstValueFrom } from 'rxjs';
import { provideRouter } from '@angular/router';
import { ControlElectoralService } from '../../core/services/control-electoral.service';
import { SeccionesElectoralesService } from '../../core/services/secciones-electorales.service';
import { ColoniasService } from '../../core/services/colonias.service';
import { UsuariosService } from '../../core/services/usuarios.service';
import { VotantesService } from '../../core/services/votantes.service';
import { SeccionAsignada } from '../../core/models/seccion-asignada.model';

describe('Inicio', () => {
  let component: Inicio;
  let fixture: ComponentFixture<Inicio>;
  let asignaciones: BehaviorSubject<SeccionAsignada[]>;

  beforeEach(async () => {
    asignaciones = new BehaviorSubject<SeccionAsignada[]>([]);
    await TestBed.configureTestingModule({
      imports: [Inicio],
      providers: [
        provideRouter([]),
        { provide: ControlElectoralService, useValue: { obtenerSeccionesAsignadas: () => asignaciones.asObservable() } },
        { provide: SeccionesElectoralesService, useValue: { obtenerSecciones: () => of(Array.from({ length: 81 }, (_, indice) => ({ seccion: 1000 + indice }))) } },
        { provide: ColoniasService, useValue: { obtenerColonias: () => of([]) } },
        { provide: UsuariosService, useValue: { obtenerUsuarios: () => of([]) } },
        { provide: VotantesService, useValue: { obtenerVotantes: () => of([]) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Inicio);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('muestra 80 secciones únicas asignadas aunque el catálogo tenga 81 y se repitan entre rutas', async () => {
    const registros: SeccionAsignada[] = Array.from({ length: 80 }, (_, indice) => ({
      id: `1_${1000 + indice}`, seccion: 1000 + indice, numeroRuta: 1, casillas: [],
    }));
    asignaciones.next([...registros, { ...registros[0], id: '3_1000', numeroRuta: 3 }]);
    await fixture.whenStable();
    expect((await firstValueFrom(component.vm$)).totalSecciones).toBe(80);
    expect(fixture.nativeElement.querySelectorAll('.resumen-card strong')[1].textContent).toBe('80');
    asignaciones.next([]);
    expect((await firstValueFrom(component.vm$)).totalSecciones).toBe(0);
  });
});
