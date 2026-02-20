import { Routes } from '@angular/router';
import { authGuard, gestorGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    title: 'SGP - Login',
    loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: '',
    title: 'SGP',
    canActivate: [authGuard],
    children: [
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full'
      },
      {
        path: 'dashboard',
        title: 'SGP - Dashboard',
        loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent)
      },
      {
        path: 'professionals',
        title: 'SGP - Profissionais',
        loadComponent: () => import('./features/professionals/professionals-list/patient-list/professional-list.component').then(m => m.ProfessionalsListComponent)
      },
      {
        path: 'patients',
        title: 'SGP - Pacientes',
        children: [
          {
            path: '',
            loadComponent: () => import('./features/patients/patient-list/patient-list.component').then(m => m.PatientListComponent)
          },
          {
            path: 'new',
            loadComponent: () => import('./features/patients/patient-form/patient-form.component').then(m => m.PatientFormComponent)
          },
          {
            path: ':id',
            loadComponent: () => import('./features/patients/patient-details/patient-details.component').then(m => m.PatientDetailsComponent)
          },
          {
            path: ':id/edit',
            loadComponent: () => import('./features/patients/patient-form/patient-form.component').then(m => m.PatientFormComponent)
          }
        ]
      },
      {
        path: 'calendar',
        title: 'SGP - Calendário',
        loadComponent: () => import('./features/calendar/calendar.component').then(m => m.CalendarComponent)
      },
      {
        path: 'attendance',
        title: 'SGP - Frequência',
        loadComponent: () => import('./features/attendance/attendance.component').then(m => m.AttendanceComponent)
      },
      {
        path: 'financial',
        title: 'SGP - Financeiro',
        loadComponent: () => import('./features/financial/financial.component').then(m => m.FinancialComponent)
      }
    ]
  },
  {
    path: '**',
    redirectTo: 'dashboard'
  }
];