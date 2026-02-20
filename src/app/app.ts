import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, Router, NavigationEnd, RouterLink } from '@angular/router';
import { filter, distinctUntilChanged, map, Subject, takeUntil } from 'rxjs';
import { AuthService } from './core/services/auth.service';
import { User } from './core/models/user.model';
import { ButtonModule } from 'primeng/button';
import { MenuModule } from 'primeng/menu';
import { MenuItem } from 'primeng/api';

// Itens base — sempre presentes para qualquer usuário autenticado
const BASE_MENU: MenuItem[] = [
  { label: 'Dashboard',  icon: 'pi pi-home',         routerLink: '/dashboard'  },
  { label: 'Alunos',     icon: 'pi pi-users',         routerLink: '/patients'   },
  { label: 'Calendário', icon: 'pi pi-calendar',      routerLink: '/calendar'   },
  { label: 'Frequência', icon: 'pi pi-check-square',  routerLink: '/attendance' },
  { label: 'Financeiro', icon: 'pi pi-dollar',        routerLink: '/financial'  },
];

// Itens exclusivos do gestor
const GESTOR_MENU: MenuItem[] = [
  { label: 'Profissionais', icon: 'pi pi-briefcase', routerLink: '/professionals' },
];

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, ButtonModule, MenuModule, RouterLink],
  templateUrl: './app.html',
  styleUrls: ['./app.scss']
})
export class App implements OnInit, OnDestroy {
  currentUser: User | null = null;
  showHeader  = false;
  activeRoute = '';
  mobileMenuOpen = false;
  menuItems: MenuItem[] = [];

  private destroy$ = new Subject<void>();

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    // ── Reage a CADA mudança de usuário (login, logout, troca de conta) ──
    this.authService.currentUser$
      .pipe(
        // Só dispara se o ID ou role do usuário mudou de fato
        distinctUntilChanged((a, b) => a?.id === b?.id && a?.role === b?.role),
        takeUntil(this.destroy$)
      )
      .subscribe(user => {
        this.currentUser = user;
        this.rebuildMenu(user);
        this.loadProfessionalsIfNeeded(user);
      });

    // ── Atualiza showHeader e activeRoute a cada navegação ──
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      map(event => (event as NavigationEnd).url),
      takeUntil(this.destroy$)
    ).subscribe(url => {
      this.showHeader    = !url.includes('/login');
      this.activeRoute   = url;
      this.mobileMenuOpen = false;
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Reconstrói o menu do zero para evitar itens duplicados ──
  private rebuildMenu(user: User | null): void {
    if (!user) { this.menuItems = []; return; }

    const base = BASE_MENU.map(item => ({ ...item })); // cópia para evitar mutação

    if (user.role === 'gestor') {
      // Insere "Profissionais" logo após "Alunos" (índice 2)
      base.splice(2, 0, ...GESTOR_MENU.map(item => ({ ...item })));
    }

    this.menuItems = base;
  }

  // ── Carrega profissionais apenas quando necessário ──
  private loadProfessionalsIfNeeded(user: User | null): void {
    if (user?.role === 'gestor') {
      this.authService.loadProfessionals();
    }
  }

  @HostListener('window:resize', ['$event'])
  onResize(event: Event): void {
    if ((event.target as Window).innerWidth > 768) {
      this.mobileMenuOpen = false;
    }
  }

  toggleMobileMenu(): void  { this.mobileMenuOpen = !this.mobileMenuOpen; }
  closeMobileMenu(): void   { this.mobileMenuOpen = false; }

  getInitials(name: string): string {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
  }

  getRoleLabel(role: string): string {
    return role === 'gestor' ? 'Gestor' : 'Profissional';
  }

  logout(): void { this.authService.logout(); }

  isRouteActive(route: string): boolean { return this.activeRoute.includes(route); }
}