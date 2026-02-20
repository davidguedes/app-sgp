// src/app/features/financial/financial.component.ts
import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { ChartModule } from 'primeng/chart';
import { PatientService } from '../../core/services/patient.service';
import { ExportService } from '../../core/services/export.service';
import { AuthService } from '../../core/services/auth.service';
import { Patient } from '../../core/models/patient.model';

interface FinancialStats {
  totalPatients: number;
  totalPackages: number;
  totalBase: number;
  totalLiquid: number;
}

interface DayStats {
  day: string;
  dayLabel: string;
  patients: number;
  liquid: number;
}

interface ProfessionalStats {
  id: number;
  nome: string;
  totalAlunos: number;
  receitaBruta: number;
  liquidoTotal: number;
  share: number; // % da receita total do estúdio
}

@Component({
  selector: 'app-financial',
  standalone: true,
  imports: [CommonModule, FormsModule, CardModule, ButtonModule, SelectModule, TagModule, ChartModule],
  templateUrl: './financial.component.html',
  styleUrls: ['./financial.component.scss']
})
export class FinancialComponent implements OnInit {
  protected authService = inject(AuthService);
  patients    = signal<Patient[]>([]);
  loading     = signal(false);
  isGestor    = signal(false);
  userName    = signal('');

  // Gestor: filtro por profissional
  selectedProfessional = signal<number | null>(null);

  professionalsOptions = computed(() => [
    { label: 'Todos os profissionais', value: null },
    ...this.authService.professionals().map(p => ({ label: p.nome, value: p.id }))
  ]);

  readonly daysOfWeek = [
    { key: 'seg', label: 'Segunda' }, { key: 'ter', label: 'Terça' },
    { key: 'qua', label: 'Quarta' },  { key: 'qui', label: 'Quinta' },
    { key: 'sex', label: 'Sexta' },   { key: 'sab', label: 'Sábado' }
  ];

  readonly TAX_RATE = 0.85;

  // ─────────────────────────────────────────────
  // COMPUTED: pacientes filtrados
  // ─────────────────────────────────────────────

  filteredPatients = computed<Patient[]>(() => {
    let list = this.patients();
    if (this.isGestor() && this.selectedProfessional()) {
      list = list.filter(p => p.profissional_id === this.selectedProfessional());
    }
    return list;
  });

  sortedPatients = computed<Patient[]>(() =>
    [...this.filteredPatients()].sort((a, b) =>
      a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })
    )
  );

  // ─────────────────────────────────────────────
  // COMPUTED: stats gerais
  // ─────────────────────────────────────────────

  stats = computed<FinancialStats>(() => {
    const p = this.filteredPatients();
    return {
      totalPatients: p.length,
      totalPackages: p.reduce((s, x) => s + x.valor, 0),
      totalBase:     p.reduce((s, x) => s + x.base, 0),
      totalLiquid:   p.reduce((s, x) => s + x.ganho, 0)
    };
  });

  dayStats = computed<DayStats[]>(() =>
    this.daysOfWeek.map(day => {
      const dp = this.filteredPatients().filter(p => p.dias.includes(day.key));
      return {
        day: day.key,
        dayLabel: day.label,
        patients: dp.length,
        liquid: dp.reduce((s, p) => s + p.ganho, 0)
      };
    })
  );

  // ─────────────────────────────────────────────
  // COMPUTED: stats por profissional (só gestor)
  // ─────────────────────────────────────────────

  professionalStats = computed<ProfessionalStats[]>(() => {
    if (!this.isGestor()) return [];

    const allPatients = this.patients();
    const totalLiquidGeral = allPatients.reduce((s, p) => s + p.ganho, 0);

    const map = new Map<number, ProfessionalStats>();

    allPatients.forEach(p => {
      const id = p.profissional_id;
      const nome = this.authService.getProfessionalName(id);

      if (!map.has(id)) {
        map.set(id, { id, nome, totalAlunos: 0, receitaBruta: 0, liquidoTotal: 0, share: 0 });
      }

      const entry = map.get(id)!;
      entry.totalAlunos++;
      entry.receitaBruta += p.valor;
      entry.liquidoTotal += p.ganho;
    });

    // Calcula share de cada profissional
    map.forEach(entry => {
      entry.share = totalLiquidGeral > 0 ? (entry.liquidoTotal / totalLiquidGeral) * 100 : 0;
    });

    return [...map.values()].sort((a, b) => b.liquidoTotal - a.liquidoTotal);
  });

  // Receita bruta total do estúdio (sem filtro de profissional)
  receitaEstudio = computed(() => this.patients().reduce((s, p) => s + p.valor, 0));
  liquidoEstudio = computed(() => this.patients().reduce((s, p) => s + p.ganho, 0));

  // Chart por profissional
  profChartData  = computed(() => this.buildProfChart());
  profChartOpts  = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { position: 'right' as const, labels: { font: { family: 'DM Sans', size: 11 }, padding: 16 } },
      tooltip: { callbacks: { label: (ctx: any) => ` ${ctx.label}: ${ctx.parsed.toFixed(1)}%` } }
    }
  };

  // Chart por dia da semana
  dayChartData = computed(() => {
    const ds = this.dayStats();
    return {
      labels: ds.map(d => d.dayLabel),
      datasets: [{
        label: 'Ganho líquido',
        data: ds.map(d => d.liquid),
        backgroundColor: 'rgba(122, 158, 126, 0.7)',
        borderColor: 'var(--sage-dark, #4e6e52)',
        borderWidth: 1.5,
        borderRadius: 6
      }]
    };
  });

  dayChartOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: {
        ticks: { callback: (v: any) => 'R$' + (v / 1000).toFixed(0) + 'k' },
        grid: { color: 'rgba(0,0,0,0.06)' }
      },
      x: { grid: { display: false } }
    }
  };

  constructor(
    private patientService: PatientService,
    private exportService: ExportService,
  ) {}

  ngOnInit(): void {
    const user = this.authService.getCurrentUser();
    if (user) {
      this.isGestor.set(user.role === 'gestor');
      this.userName.set(user.nome);
    }

    this.loading.set(true);
    this.patientService.loadPatients();
    this.patientService.getPatients().subscribe({
      next: (patients) => { this.patients.set(patients); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  onProfessionalChange(value: number | null): void {
    this.selectedProfessional.set(value);
  }

  // ─────────────────────────────────────────────
  // CHART HELPERS
  // ─────────────────────────────────────────────

  private buildProfChart() {
    const ps = this.professionalStats();
    if (!ps.length) return null;

    const colors = ['#7a9e7e', '#c4956a', '#5a8f5a', '#d4a574', '#4e6e52', '#b8a090', '#8fb89a'];
    return {
      labels: ps.map(p => p.nome),
      datasets: [{
        data: ps.map(p => p.share),
        backgroundColor: colors.slice(0, ps.length),
        borderWidth: 2,
        borderColor: 'var(--surface-card, white)'
      }]
    };
  }

  getShareBarWidth(share: number): string {
    return Math.max(share, 2).toFixed(1) + '%';
  }

  // ─────────────────────────────────────────────
  // EXPORT
  // ─────────────────────────────────────────────

  exportToExcel(): void {
    const user = this.authService.getCurrentUser();
    if (!user) return;
    const patients = this.sortedPatients();
    if (!patients.length) return;
    this.exportService.exportPatientsToExcel(patients, user.nome, user.role);
  }

  // ─────────────────────────────────────────────
  // UTILS
  // ─────────────────────────────────────────────

  getInitials(name: string): string {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
  }

  getAvatarColorFromId(id: number): string {
    const colors = ['#7a9e7e', '#c4956a', '#5a8f5a', '#d4a574', '#4e6e52'];
    return colors[id % colors.length];
  }
}