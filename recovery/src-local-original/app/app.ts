import { Component } from '@angular/core';
import { NgIf } from '@angular/common';
import { Router, RouterOutlet } from '@angular/router';
import { Navbar } from './shared/components/navbar/navbar';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Navbar, NgIf],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected title = 'promocion-al-voto';

  constructor(public router: Router) {}

  get mostrarNavbar(): boolean {
    return this.router.url !== '/login';
  }
}