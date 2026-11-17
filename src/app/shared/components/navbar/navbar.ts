import { NgIf } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';

import { AuthService } from '../../../core/services/auth.service';
import { NOMBRES_ROL, RolUsuario } from '../../../core/models/usuario-sistema.model';

@Component({
  selector: 'app-navbar',
  imports: [RouterLink, RouterLinkActive, NgIf],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css',
})
export class Navbar {
  private router = inject(Router);
  private authService = inject(AuthService);

  nombreUsuario = this.authService.obtenerNombreLocal();
  rolUsuario = this.authService.obtenerRolLocal();
  nombreRol = NOMBRES_ROL[this.rolUsuario as RolUsuario] || this.rolUsuario;

  menuAbierto = false;

  alternarMenu(): void {
    this.menuAbierto = !this.menuAbierto;
  }

  cerrarMenu(): void {
    this.menuAbierto = false;
  }

  async cerrarSesion(): Promise<void> {
    await this.authService.cerrarSesion();
    this.menuAbierto = false;
    this.router.navigate(['/login']);
  }
}
