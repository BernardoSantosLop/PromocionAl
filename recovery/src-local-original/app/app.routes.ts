import { Routes } from '@angular/router';

import { Inicio } from './pages/inicio/inicio';
import { Login } from './pages/login/login';
import { Votantes } from './pages/votantes/votantes';
import { RegistroVotante } from './pages/registro-votante/registro-votante';
import { Estructura } from './pages/estructura/estructura';

import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';

export const routes: Routes = [
  {
    path: 'login',
    component: Login,
  },
  {
    path: '',
    component: Inicio,
    canActivate: [authGuard, roleGuard],
    data: {
      roles: ['coordinador'],
    },
  },
  {
    path: 'registro-votante',
    component: RegistroVotante,
    canActivate: [authGuard],
  },
  {
    path: 'votantes',
    component: Votantes,
    canActivate: [authGuard, roleGuard],
    data: {
      roles: ['coordinador'],
    },
  },
  {
    path: 'estructura',
    component: Estructura,
    canActivate: [authGuard, roleGuard],
    data: {
      roles: ['coordinador', 'seccional'],
    },
  },
  {
    path: '**',
    redirectTo: 'registro-votante',
  },
];
