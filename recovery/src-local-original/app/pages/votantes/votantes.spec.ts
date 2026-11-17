import { ComponentFixture, TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';

import { UsuarioSistema } from '../../core/models/usuario-sistema.model';
import { Votante } from '../../core/models/votante.model';
import { UsuariosService } from '../../core/services/usuarios.service';
import { VotantesService } from '../../core/services/votantes.service';
import { Votantes } from './votantes';

describe('Votantes', () => {
  let component: Votantes;
  let fixture: ComponentFixture<Votantes>;
  const usuarios: UsuarioSistema[] = [
    {
      uid: 'delegado-a',
      nombre: 'Delegado A',
      correo: '',
      rol: 'coordinador',
      activo: true,
    },
    {
      uid: 'delegado-b',
      nombre: 'Delegado B',
      correo: '',
      rol: 'coordinador',
      activo: true,
    },
    {
      uid: 'enlace-a1',
      nombre: 'Enlace A1',
      correo: '',
      rol: 'seccional',
      activo: true,
      coordinadorUid: 'delegado-a',
    },
    {
      uid: 'enlace-a2',
      nombre: 'Enlace A2',
      correo: '',
      rol: 'seccional',
      activo: true,
      coordinadorUid: 'delegado-a',
    },
    {
      uid: 'enlace-b1',
      nombre: 'Enlace B1',
      correo: '',
      rol: 'seccional',
      activo: true,
      coordinadorUid: 'delegado-b',
    },
    {
      uid: 'movilizador-a1',
      nombre: 'Movilizador A1',
      correo: '',
      rol: 'movilizador',
      activo: true,
      seccionalUid: 'enlace-a1',
    },
    {
      uid: 'movilizador-a2',
      nombre: 'Movilizador A2',
      correo: '',
      rol: 'movilizador',
      activo: true,
      seccionalUid: 'enlace-a2',
    },
    {
      uid: 'movilizador-b1',
      nombre: 'Movilizador B1',
      correo: '',
      rol: 'movilizador',
      activo: true,
      seccionalUid: 'enlace-b1',
    },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Votantes],
      providers: [
        {
          provide: UsuariosService,
          useValue: { obtenerUsuarios: () => of(usuarios) },
        },
        {
          provide: VotantesService,
          useValue: { obtenerVotantes: () => of([]) },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Votantes);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('muestra solo los enlaces del delegado seleccionado', async () => {
    component.filtros.coordinadorUid = 'delegado-a';
    component.alCambiarCoordinador();

    const enlaces = await firstValueFrom(component.seccionalesDisponibles$);

    expect(enlaces.map((enlace) => enlace.uid)).toEqual([
      'enlace-a1',
      'enlace-a2',
    ]);
  });

  it('muestra solo los movilizadores del enlace seleccionado', async () => {
    component.filtros.coordinadorUid = 'delegado-a';
    component.alCambiarCoordinador();
    component.filtros.seccionalUid = 'enlace-a1';
    component.alCambiarSeccional();

    const movilizadores = await firstValueFrom(
      component.movilizadoresDisponibles$
    );

    expect(movilizadores.map((movilizador) => movilizador.uid)).toEqual([
      'movilizador-a1',
    ]);
  });

  it('filtra simpatizantes por la asignación del movilizador', () => {
    const simpatizantes = [
      { id: '1', movilizadorUid: 'movilizador-a1', capturadoPorUid: 'admin' },
      { id: '2', movilizadorUid: 'movilizador-a2', capturadoPorUid: 'admin' },
      { id: '3', capturadoPorUid: 'movilizador-a1' },
    ] as Votante[];

    const resultado = component.filtrarVotantes(
      simpatizantes,
      {
        ...component.filtros,
        coordinadorUid: 'delegado-a',
        seccionalUid: 'enlace-a1',
        movilizadorUid: 'movilizador-a1',
      },
      usuarios
    );

    expect(resultado.map((simpatizante) => simpatizante.id)).toEqual([
      '1',
      '3',
    ]);
  });
});
