import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors, withInterceptorsFromDi } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { routes } from './app.routes';
import { providePrimeNG } from 'primeng/config';
import Lara from '@primeuix/themes/lara';
import { httpAuthInterceptor } from './core/interceptors/auth.interceptor';
import pt from 'primelocale/pt.json'; // Importe o JSON de tradução

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(withInterceptorsFromDi()),
    provideAnimationsAsync(),
    provideHttpClient(
      withInterceptors([httpAuthInterceptor])
    ),
    providePrimeNG({ 
      ripple: true,
      theme: {
        preset: Lara
      },
      translation: pt.pt
    }),
  ]
};