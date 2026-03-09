// src/app/features/financial/financial.component.ts
import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { ChartModule } from 'primeng/chart';
import { DialogModule } from 'primeng/dialog';
import { DatePickerModule } from 'primeng/datepicker';
import { RadioButtonModule } from 'primeng/radiobutton';
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
  share: number;
}

@Component({
  selector: 'app-financial',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    CardModule, ButtonModule, SelectModule, TagModule, ChartModule,
    DialogModule, DatePickerModule, RadioButtonModule
  ],
  templateUrl: './financial.component.html',
  styleUrls: ['./financial.component.scss']
})
export class FinancialComponent implements OnInit {
  protected authService = inject(AuthService);

  patients     = signal<Patient[]>([]);
  loading      = signal(false);
  isGestor     = signal(false);
  userName     = signal('');

  // ── Filtro de período (visualização) ────────────────────────────────────
  filterPanelOpen  = signal(false);
  loadingPeriod    = signal(false);
  activePeriodLabel = signal('');

  periodMode: 'month' | 'custom' = 'month';
  periodMonthDate: Date = new Date();
  periodStartDate: Date | null = null;
  periodEndDate:   Date | null = null;

  // Guarda o período ativo para reusar no export
  private activePeriodStart = '';
  private activePeriodEnd   = '';

  // ── Filtro por profissional (gestor) ────────────────────────────────────
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

  // ── Diálogo de exportação ───────────────────────────────────────────────
  showExportDialog = signal(false);
  exportMode: 'month' | 'custom' = 'month';
  exportMonthDate: Date = new Date();
  exportStartDate: Date | null = null;
  exportEndDate:   Date | null = null;

  // ── COMPUTED: pacientes filtrados por profissional ──────────────────────
  //
  // ATENÇÃO: removemos o filtro por data_fim aqui.
  // A rota /patients/financial já retorna apenas os alunos que estavam ativos
  // no período consultado — filtrar data_fim no frontend com "hoje" quebraria
  // consultas históricas de meses anteriores.
  //
  filteredPatients = computed<Patient[]>(() => {
    let list = this.patients();

    if (this.isGestor() && this.selectedProfessional()) {
      list = list.filter(p => p.profissional_id === this.selectedProfessional());
    }

    // Exclui experimentais (não entram no financeiro)
    list = list.filter(p => p.tipo !== 'experimental');

    return list;
  });

  sortedPatients = computed<Patient[]>(() =>
    [...this.filteredPatients()].sort((a, b) =>
      a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })
    )
  );

  // ── COMPUTED: cards de resumo ───────────────────────────────────────────
  stats = computed<FinancialStats>(() => {
    const p = this.filteredPatients();
    return {
      totalPatients: p.length,
      totalPackages: p.reduce((s, x) => s + x.valor, 0),
      totalBase:     p.reduce((s, x) => s + x.base, 0),
      totalLiquid:   p.reduce((s, x) => {
        // Convênio: usa ganho_convenio (aulas × valor/aula do período)
        // Fixo: usa ganho do cadastro
        const ganho = x.tipo === 'convenio' ? (x.ganho_convenio ?? 0) : x.ganho;
        return s + ganho;
      }, 0),
    };
  });

  // ── COMPUTED: gráfico de barras por dia da semana ──────────────────────
  dayStats = computed<DayStats[]>(() =>
    this.daysOfWeek.map(day => {
      const dp = this.filteredPatients().filter(p => p.dias.includes(day.key));
      return {
        day:      day.key,
        dayLabel: day.label,
        patients: dp.length,
        liquid:   dp.reduce((s, p) => {
          const ganho = p.tipo === 'convenio' ? (p.ganho_convenio ?? 0) : p.ganho;
          return s + ganho;
        }, 0)
      };
    })
  );

  // ── COMPUTED: breakdown por profissional (gestor) ───────────────────────
  professionalStats = computed<ProfessionalStats[]>(() => {
    if (!this.isGestor()) return [];

    const allPatients = this.patients().filter(p => p.tipo !== 'experimental');
    const totalLiquidGeral = allPatients.reduce((s, p) => {
      return s + (p.tipo === 'convenio' ? (p.ganho_convenio ?? 0) : p.ganho);
    }, 0);

    const map = new Map<number, ProfessionalStats>();

    allPatients.forEach(p => {
      const id   = p.profissional_id;
      const nome = this.authService.getProfessionalName(id);
      const ganho = p.tipo === 'convenio' ? (p.ganho_convenio ?? 0) : p.ganho;

      if (!map.has(id)) {
        map.set(id, { id, nome, totalAlunos: 0, receitaBruta: 0, liquidoTotal: 0, share: 0 });
      }

      const entry = map.get(id)!;
      entry.totalAlunos++;
      entry.receitaBruta += p.valor;
      entry.liquidoTotal += ganho;
    });

    map.forEach(entry => {
      entry.share = totalLiquidGeral > 0 ? (entry.liquidoTotal / totalLiquidGeral) * 100 : 0;
    });

    return [...map.values()].sort((a, b) => b.liquidoTotal - a.liquidoTotal);
  });

  // Cards do estúdio inteiro (sem filtro de profissional)
  receitaEstudio = computed(() =>
    this.patients()
      .filter(p => p.tipo !== 'experimental')
      .reduce((s, p) => s + p.valor, 0)
  );

  liquidoEstudio = computed(() =>
    this.patients()
      .filter(p => p.tipo !== 'experimental')
      .reduce((s, p) => s + (p.tipo === 'convenio' ? (p.ganho_convenio ?? 0) : p.ganho), 0)
  );

  // ── Charts ──────────────────────────────────────────────────────────────
  profChartData = computed(() => this.buildProfChart());
  profChartOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { position: 'right' as const, labels: { font: { family: 'DM Sans', size: 11 }, padding: 16 } },
      tooltip: { callbacks: { label: (ctx: any) => ` ${ctx.label}: ${ctx.parsed.toFixed(1)}%` } }
    }
  };

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
    // Carrega o mês atual por padrão ao entrar na tela
    this.applyPeriod();
  }

  // ── FILTRO DE PERÍODO ────────────────────────────────────────────────────

  /**
   * Monta start/end a partir do modo escolhido e dispara a requisição.
   * É o único ponto que chama o backend — init e botão "Aplicar" usam ele.
   */
  applyPeriod(): void {
    let start: string, end: string;

    if (this.periodMode === 'month') {
      const ref = this.periodMonthDate;
      start = new Date(ref.getFullYear(), ref.getMonth(), 1).toISOString().split('T')[0];
      end   = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).toISOString().split('T')[0];

      this.activePeriodLabel.set(
        ref.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
      );
    } else {
      if (!this.periodStartDate || !this.periodEndDate) return;
      start = this.periodStartDate.toISOString().split('T')[0];
      end   = this.periodEndDate.toISOString().split('T')[0];

      this.activePeriodLabel.set(
        `${this.periodStartDate.toLocaleDateString('pt-BR')} → ${this.periodEndDate.toLocaleDateString('pt-BR')}`
      );
    }

    // Guarda para reusar no export
    this.activePeriodStart = start;
    this.activePeriodEnd   = end;

    this.filterPanelOpen.set(false);
    this.loadingPeriod.set(true);
    this.loading.set(true);

    this.patientService.getPatientsByPeriod(start, end).subscribe({
      next: (patients) => {
        this.patients.set(patients); // ← signal atualizado → computed reagem automaticamente
        this.loadingPeriod.set(false);
        this.loading.set(false);
      },
      error: () => {
        this.loadingPeriod.set(false);
        this.loading.set(false);
      }
    });
  }

  /** Atalho para voltar ao mês atual sem precisar abrir o painel */
  resetToCurrentMonth(): void {
    this.periodMode      = 'month';
    this.periodMonthDate = new Date();
    this.applyPeriod();
  }

  onProfessionalChange(value: number | null): void {
    this.selectedProfessional.set(value);
  }

  // ── EXPORT ───────────────────────────────────────────────────────────────

  openExportDialog(): void {
    // Pré-preenche o dialog com o período que está sendo visualizado
    this.exportMode      = this.periodMode;
    this.exportMonthDate = new Date(this.periodMonthDate);
    this.exportStartDate = this.periodStartDate ? new Date(this.periodStartDate) : null;
    this.exportEndDate   = this.periodEndDate   ? new Date(this.periodEndDate)   : null;
    this.showExportDialog.set(true);
  }

  confirmExport(): void {
    const user = this.authService.getCurrentUser();
    if (!user) return;
    const patients = this.sortedPatients();
    if (!patients.length) return;

    let start: string, end: string;

    if (this.exportMode === 'month') {
      const ref = this.exportMonthDate ?? new Date();
      start = new Date(ref.getFullYear(), ref.getMonth(), 1).toISOString().split('T')[0];
      end   = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).toISOString().split('T')[0];
    } else {
      if (!this.exportStartDate || !this.exportEndDate) return;
      start = this.exportStartDate.toISOString().split('T')[0];
      end   = this.exportEndDate.toISOString().split('T')[0];
    }

    this.showExportDialog.set(false);

    this.patientService.getAvulsoByPeriod(start, end).subscribe({
      next: (avulsos) => {
        this.exportService.exportPatientsToExcel(
          patients, user.nome, user.role, avulsos,
          new Date(start + 'T00:00:00'),
          new Date(end   + 'T00:00:00')
        );
      },
      error: () => {
        this.exportService.exportPatientsToExcel(
          patients, user.nome, user.role, [],
          new Date(start + 'T00:00:00'),
          new Date(end   + 'T00:00:00')
        );
      }
    });
  }

  // ── CHART HELPERS ────────────────────────────────────────────────────────

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

  // ── UTILS ────────────────────────────────────────────────────────────────

  getInitials(name: string): string {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
  }

  getAvatarColorFromId(id: number): string {
    const colors = ['#7a9e7e', '#c4956a', '#5a8f5a', '#d4a574', '#4e6e52'];
    return colors[id % colors.length];
  }
}