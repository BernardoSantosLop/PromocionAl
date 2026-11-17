import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  imports: [CommonModule, FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  private authService = inject(AuthService);
  private router = inject(Router);
  private cd = inject(ChangeDetectorRef);

  correo = '';
  password = '';

  cargando = false;
  mensajeError = '';

  async iniciarSesion(): Promise<void> {
    this.mensajeError = '';

    if (!this.correo.trim() || !this.password.trim()) {
      this.mensajeError = 'Ingresa correo y contraseña.';
      this.cd.detectChanges();
      return;
    }

    try {
      this.cargando = true;
      this.cd.detectChanges();

      const usuario = await this.authService.iniciarSesion(
        this.correo.trim(),
        this.password
      );

      if (usuario.rol === 'coordinador') {
        this.router.navigate(['/']);
        return;
      }

      this.router.navigate(['/registro-votante']);
    } catch (error) {
      console.error('Error al iniciar sesión:', error);

      this.mensajeError =
        'No se pudo iniciar sesión. Revisa tu correo, contraseña o permisos.';

      this.cd.detectChanges();
    } finally {
      this.cargando = false;
      this.cd.detectChanges();
    }
  }
}