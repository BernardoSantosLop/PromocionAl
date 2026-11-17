import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-control-electoral-nav',
  imports: [RouterLink, RouterLinkActive],
  template: `<nav aria-label="Secciones de Control Electoral">
    <a
      routerLink="/control-electoral"
      routerLinkActive="activo"
      [routerLinkActiveOptions]="{ exact: true }"
      ariaCurrentWhenActive="page"
      >Rutas y secciones</a
    >
    <a
      routerLink="/control-electoral/registrar-rg"
      routerLinkActive="activo"
      ariaCurrentWhenActive="page"
      >Registrar RG</a
    >
    <a
      routerLink="/control-electoral/asignar-rutas"
      routerLinkActive="activo"
      ariaCurrentWhenActive="page"
      >RG y rutas</a
    >
  </nav>`,
  styles: `
    :host {
      display: block;
      margin: 20px 0;
    }
    nav {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      padding: 5px;
      background: #e9edf3;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      width: fit-content;
    }
    a {
      display: flex;
      align-items: center;
      min-height: 38px;
      padding: 9px 16px;
      border-radius: 7px;
      font:
        600 12px Arial,
        sans-serif;
      text-decoration: none;
      color: #64748b;
    }
    a:hover {
      color: #0f172a;
      background: #ffffff80;
    }
    a.activo {
      background: #fff;
      color: #0f172a;
      box-shadow: 0 1px 4px #0f172a0d;
    }
    a:focus-visible {
      outline: 3px solid #93c5fd;
      outline-offset: 2px;
    }
    @media (max-width: 700px) {
      nav {
        width: 100%;
      }
      a {
        justify-content: center;
        flex: 1;
        min-height: 44px;
        padding: 9px 10px;
      }
    }
  `,
})
export class ControlElectoralNav {}
