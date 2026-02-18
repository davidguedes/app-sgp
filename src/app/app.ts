import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AuthService } from './core/services/auth.service';
import { User } from './core/models/user.model';
import { ButtonModule } from 'primeng/button';
import { MenuModule } from 'primeng/menu';
import { MenuItem } from 'primeng/api';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    ButtonModule,
    MenuModule,
    RouterLink
  ],
  templateUrl: './app.html',
  styleUrls: ['./app.scss']
})
export class App implements OnInit {
  currentUser: User | null = null;
  showHeader = false;
  activeRoute = '';
  
  menuItems: MenuItem[] = [
    {
      label: 'Dashboard',
      icon: 'pi pi-home',
      routerLink: '/dashboard'
    },
    {
      label: 'Alunos',
      icon: 'pi pi-users',
      routerLink: '/patients'
    },
    {
      label: 'Calendário',
      icon: 'pi pi-calendar',
      routerLink: '/calendar'
    },
    {
      label: 'Frequência',
      icon: 'pi pi-check-square',
      routerLink: '/attendance'
    },
    {
      label: 'Financeiro',
      icon: 'pi pi-dollar',
      routerLink: '/financial'
    }
  ];
  
  constructor(
    private authService: AuthService,
    private router: Router
  ) {}
  
  ngOnInit(): void {
    // Observar mudanças de autenticação
    this.authService.currentUser$.subscribe(user => {
      this.currentUser = user;
    });
    
    // Observar mudanças de rota para controlar exibição do header
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      this.showHeader = !event.url.includes('/login');
      this.activeRoute = event.url;
    });
  }
  
  getInitials(name: string): string {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  }
  
  getRoleLabel(role: string): string {
    return role === 'gestor' ? 'Gestor' : 'Profissional';
  }
  
  logout(): void {
    this.authService.logout();
  }
  
  isRouteActive(route: string): boolean {
    return this.activeRoute.includes(route);
  }
}