import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  
  console.log('autenticado: ', authService.isAuthenticated());

  if (authService.isAuthenticated()) {
    return true;
  }
  
  // Redireciona para login se não autenticado
  router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
  return false;
};

export const gestorGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  
  if (!authService.isAuthenticated()) {
    router.navigate(['/login']);
    return false;
  }
  
  if (authService.isGestor()) {
    return true;
  }
  
  // Redireciona para dashboard se não for gestor
  router.navigate(['/dashboard']);
  return false;
};