import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '../services/auth.service';
import { RolUsuario } from '../models/usuario-sistema.model';

export const roleGuard: CanActivateFn = (route) => {
  const router = inject(Router);
  const authService = inject(AuthService);

  const rolesPermitidos = route.data?.['roles'] as RolUsuario[] | undefined;
  const rolUsuario = authService.obtenerRolLocal() as RolUsuario;

  if (!rolesPermitidos || rolesPermitidos.includes(rolUsuario)) {
    return true;
  }

  return router.createUrlTree(['/registro-votante']);
};