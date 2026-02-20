import { Component, OnInit, HostListener } from '@angular/core';
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
  mobileMenuOpen = false;

  menuItems: MenuItem[] = [
    {
      label: 'Dashboard',
      icon: 'pi pi-home',
      routerLink: '/dashboard'
    },
    // {
    //   label: 'Profissionais',
    //   icon: 'pi pi-id-card',
    //   routerLink: '/professionals'
    // },
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
    this.authService.currentUser$.subscribe(user => {
      this.currentUser = user;
    });
    this.authService.loadProfessionals();
    
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      this.showHeader = !event.url.includes('/login');
      this.activeRoute = event.url;
      this.mobileMenuOpen = false; // fecha menu ao navegar
    });
  }

  // Fecha o menu ao redimensionar para desktop
  @HostListener('window:resize', ['$event'])
  onResize(event: Event): void {
    const width = (event.target as Window).innerWidth;
    if (width > 768 && this.mobileMenuOpen) {
      this.mobileMenuOpen = false;
    }
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen = !this.mobileMenuOpen;
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen = false;
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