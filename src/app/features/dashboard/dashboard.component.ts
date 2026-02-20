// src/app/features/dashboard/dashboard.component.ts
import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { ChartModule } from 'primeng/chart';
import { TagModule } from 'primeng/tag';
import { PatientService } from '../../core/services/patient.service';
import { AuthService } from '../../core/services/auth.service';
import { PatientStats } from '../../core/models/patient.model';
import { DashboardProfissionalComponent } from './dashboard-profissional/dashboard-profissional.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    CardModule,
    ButtonModule,
    ChartModule,
    TagModule,
    DashboardProfissionalComponent
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  stats = signal<PatientStats>({
    totalAlunos: 0,
    ganhoTotal: 0,
    presencas: 0,
    faltas: 0,
    taxaPresenca: 0
  });

  loading = signal(true);
  userName = signal('');
  userRole = signal('');

  /** true = usuário é profissional → renderiza dashboard alternativo */
  isProfissional = signal(false);

  attendanceChartData: any;
  attendanceChartOptions: any;

  constructor(
    private patientService: PatientService,
    private authService: AuthService
  ) {
    this.setupChartOptions();
  }

  ngOnInit(): void {
    const user = this.authService.getCurrentUser();
    if (user) {
      this.userName.set(user.nome);
      this.userRole.set(user.role === 'gestor' ? 'Gestor' : 'Profissional');
      this.isProfissional.set(user.role === 'profissional');
    }

    // Dashboard do gestor precisa de stats; profissional carrega no próprio componente
    if (!this.isProfissional()) {
      this.loadStats();
    } else {
      this.loading.set(false);
    }
  }

  loadStats(): void {
    this.loading.set(true);
    this.patientService.getStats().subscribe({
      next: (stats) => {
        this.stats.set(stats);
        this.updateChart(stats);
        this.loading.set(false);
      },
      error: (error) => {
        console.error('Erro ao carregar estatísticas:', error);
        this.loading.set(false);
      }
    });
  }

  setupChartOptions(): void {
    this.attendanceChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { font: { family: 'DM Sans', size: 12 } }
        }
      }
    };
  }

  updateChart(stats: PatientStats): void {
    this.attendanceChartData = {
      labels: ['Presenças', 'Faltas'],
      datasets: [{
        data: [stats.presencas, stats.faltas],
        backgroundColor: ['rgba(90, 143, 90, 0.8)', 'rgba(192, 96, 96, 0.8)'],
        borderColor: ['#5a8f5a', '#c06060'],
        borderWidth: 2
      }]
    };
  }

  getSeverity(rate: number): 'success' | 'warn' | 'danger' {
    if (rate >= 80) return 'success';
    if (rate >= 60) return 'warn';
    return 'danger';
  }
}