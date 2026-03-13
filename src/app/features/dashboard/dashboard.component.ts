// src/app/features/dashboard/dashboard.component.ts
import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { ChartModule } from 'primeng/chart';
import { TagModule } from 'primeng/tag';
import { DividerModule } from 'primeng/divider';
import { TooltipModule } from 'primeng/tooltip';
import { PatientService } from '../../core/services/patient.service';
import { AuthService } from '../../core/services/auth.service';
import { PatientStats, Patient } from '../../core/models/patient.model';
import { DashboardProfissionalComponent } from './dashboard-profissional/dashboard-profissional.component';
import { forkJoin } from 'rxjs';
import { Attendance } from '../../core/models/attendance.model';

interface ProfDashStats {
  id: string;
  nome: string;
  totalAlunos: number;
  aulasSemanais: number;
  receitaBruta: number;
  receitaLiquida: number;
  share: number;
  taxaPresenca: number;
  presencas: number;
  faltas: number;
  diasAtivos: string[];
  alunosNovos: number;
  reposicoesPendentes: number;
}

interface TodaySnapshot {
  totalAulasHoje: number;
  profissionaisAtivos: number;
  alunosHoje: { nome: string; horario: string; profissional: string }[];
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule, RouterLink, CardModule, ButtonModule,
    ChartModule, TagModule, DividerModule, TooltipModule,
    DashboardProfissionalComponent
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  protected authService  = inject(AuthService);
  private patientService = inject(PatientService);

  stats      = signal<PatientStats>({ totalAlunos: 0, ganhoTotal: 0, presencas: 0, faltas: 0, taxaPresenca: 0 });
  patients   = signal<Patient[]>([]);
  attendances = signal<Attendance[]>([]);
  loading    = signal(true);
  userName   = signal('');
  userRole   = signal('');
  isProfissional = signal(false);

  attendanceChartData: any;
  attendanceChartOptions: any;
  profChartData: any;
  profChartOptions: any;

  readonly daysOfWeek = [
    { key: 'seg', label: 'Segunda' }, { key: 'ter', label: 'Terça'   },
    { key: 'qua', label: 'Quarta'  }, { key: 'qui', label: 'Quinta'  },
    { key: 'sex', label: 'Sexta'   }, { key: 'sab', label: 'Sábado'  }
  ];

  // ─────────────────────────────────────────────────────────────────────────
  // COMPUTEDS FINANCEIROS
  //
  // ANTES: usavam p.valor e p.ganho diretamente → errado para convênio
  //   receitaLiquidaTotal = patients().reduce((s, p) => s + p.ganho, 0)
  //   Para convênio, p.ganho = valor por aula (não o mensal!)
  //
  // AGORA: usam ganho_liquido_periodo — campo calculado pelo backend
  //   que já resolve fixo, convênio e experimental corretamente.
  //   O dashboard carrega /patients/financial?start=...&end=... para o mês atual,
  //   então ganho_liquido_periodo reflete exatamente o mês em questão.
  // ─────────────────────────────────────────────────────────────────────────

  receitaBrutaTotal = computed(() =>
    // receita bruta = soma dos pacotes (fixo) — convênio não tem pacote fixo
    this.patients()
      .filter(p => p.tipo !== 'experimental')
      .reduce((s, p) => s + (p.valor || 0), 0)
  );

  receitaLiquidaTotal = computed(() =>
    // CORRETO: usa ganho_liquido_periodo (backend já calculou por modalidade)
    this.patients()
      .filter(p => p.tipo !== 'experimental')
      .reduce((s, p) => s + p.ganho_liquido_periodo, 0)
  );

  totalAlunosAtivos = computed(() =>
    // Exclui experimentais — consistente com receitaLiquidaTotal e com o financeiro.
    // Experimental não paga, então não deve entrar na contagem de "alunos ativos pagantes".
    this.patients().filter(p => p.tipo !== 'experimental').length
  );

  alunosNovos30d = computed(() => {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30); cutoff.setHours(0,0,0,0);
    return this.patients().filter(p => {
      const inicio = new Date(p.data_inicio); inicio.setHours(0,0,0,0);
      return inicio >= cutoff;
    }).length;
  });

  totalAulasSemanais = computed(() => {
    const days = ['seg','ter','qua','qui','sex','sab'];
    return days.reduce((s, d) =>
      s + this.patients().filter(p => p.dias.includes(d)).length, 0
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // STATS POR PROFISSIONAL
  //
  // ANTES: receitaLiquida = active.reduce((s,p) => s + p.ganho, 0)
  //   → errado para convênio (p.ganho = valor/aula, não o mensal)
  //
  // AGORA: usa ganho_liquido_periodo — mesmo campo usado nos cards globais
  // ─────────────────────────────────────────────────────────────────────────
  profStats = computed<ProfDashStats[]>(() => {
    const professionals = this.authService.professionals();
    const allPatients   = this.patients();
    const allAtt        = this.attendances();
    const days          = ['seg','ter','qua','qui','sex','sab'];
    const cutoff30      = new Date(); cutoff30.setDate(cutoff30.getDate() - 30); cutoff30.setHours(0,0,0,0);

    // Total líquido geral para calcular o share de cada profissional
    const liquidoTotal = allPatients
      .filter(p => p.tipo !== 'experimental')
      .reduce((s, p) => s + p.ganho_liquido_periodo, 0);

    return professionals.map(prof => {
      // Backend já retorna só os ativos no período (filtragem por data no /financial)
      const profPatients = allPatients.filter(p => p.profissional_id === Number(prof.id));
      const active       = profPatients.filter(p => p.tipo !== 'experimental');

      const aulasSemanais = days.reduce((s, d) =>
        s + active.filter(p => p.dias.includes(d)).length, 0);

      const diasAtivos = days.filter(d => active.some(p => p.dias.includes(d)));

      const receitaBruta   = active.reduce((s, p) => s + (p.valor || 0), 0);

      // CORRETO: ganho_liquido_periodo resolve todas as modalidades
      const receitaLiquida = active.reduce((s, p) => s + p.ganho_liquido_periodo, 0);

      const share = liquidoTotal > 0 ? (receitaLiquida / liquidoTotal) * 100 : 0;

      const profAttendances = allAtt.filter(a =>
        active.some(p => p.id === a.patient_id));
      const presencas = profAttendances.filter(a => a.status === 'present').length;
      const faltas    = profAttendances.filter(a => a.status === 'absent').length;
      const taxaPresenca = (presencas + faltas) > 0
        ? Math.round((presencas / (presencas + faltas)) * 100) : 0;

      const alunosNovos = active.filter(p => {
        const inicio = new Date(p.data_inicio); inicio.setHours(0,0,0,0);
        return inicio >= cutoff30;
      }).length;

      const reposicoesPendentes = active.filter(p => {
        const att = allAtt
          .filter(a => a.patient_id === p.id)
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const lastAbsent = att.find(a => a.status === 'absent');
        const lastMakeup = att.find(a => a.status === 'makeup');
        return !!lastAbsent && (!lastMakeup ||
          new Date(lastAbsent.date) > new Date(lastMakeup.date));
      }).length;

      return {
        id: prof.id, nome: prof.nome,
        totalAlunos: active.length, aulasSemanais,
        receitaBruta, receitaLiquida, share,
        taxaPresenca, presencas, faltas,
        diasAtivos, alunosNovos, reposicoesPendentes
      };
    }).sort((a, b) => b.receitaLiquida - a.receitaLiquida);
  });

  todaySnapshot = computed<TodaySnapshot>(() => {
    const todayKey = this.getTodayKey();
    if (!todayKey) return { totalAulasHoje: 0, profissionaisAtivos: 0, alunosHoje: [] };

    const active   = this.patients().filter(p => p.dias.includes(todayKey));
    const profIds  = new Set(active.map(p => p.profissional_id));
    const alunosHoje = active
      .map(p => ({
        nome: p.nome,
        horario: p.horarios?.[todayKey] || '--:--',
        profissional: this.authService.getProfessionalName(p.profissional_id)
      }))
      .sort((a, b) => a.horario.localeCompare(b.horario));

    return { totalAulasHoje: active.length, profissionaisAtivos: profIds.size, alunosHoje };
  });

  dayDistribution = computed(() => {
    return this.daysOfWeek.map(d => ({
      ...d,
      count: this.patients().filter(p => p.dias.includes(d.key)).length
    }));
  });

  maxDayCount = computed(() =>
    Math.max(...this.dayDistribution().map(d => d.count), 1));

  totalReposicoesPendentes = computed(() =>
    this.profStats().reduce((s, p) => s + p.reposicoesPendentes, 0));

  totalAlunosNovos = computed(() =>
    this.profStats().reduce((s, p) => s + p.alunosNovos, 0));

  constructor() {
    this.setupChartOptions();
  }

  ngOnInit(): void {
    const user = this.authService.getCurrentUser();
    if (user) {
      this.userName.set(user.nome);
      this.userRole.set(user.role === 'gestor' ? 'Gestor' : 'Profissional');
      this.isProfissional.set(user.role === 'profissional');
    }

    if (this.isProfissional()) {
      this.loading.set(false);
      return;
    }

    this.authService.loadProfessionals();

    // ─────────────────────────────────────────────────────────────────────
    // FONTE ÚNICA DE VERDADE: carrega apenas /patients/financial.
    //
    // Antes havia duas chamadas paralelas — /financial + /stats/period —
    // que podiam divergir: /stats/period incluía experimentais em totalAlunos,
    // enquanto os computed do Angular os excluíam. Resultado: cards com
    // valores diferentes para a mesma grandeza.
    //
    // Agora todos os totais (ganho, alunos, presença) são derivados do mesmo
    // array via computed. Uma fonte → zero divergência possível.
    //
    // O único uso que resta de stats() é o gráfico de presença/falta,
    // que também é derivado diretamente dos pacientes carregados.
    // ─────────────────────────────────────────────────────────────────────
    const { start, end } = PatientService.monthRange(new Date());

    this.patientService.getPatientsByPeriod(start, end).subscribe({
      next: (patients) => {
        this.patients.set(patients);

        // Deriva stats do mesmo array — sem segunda requisição
        const nonExp    = patients.filter(p => p.tipo !== 'experimental');
        const presencas = patients.reduce((s, p) => s + (p.aulas_realizadas ?? 0), 0);
        const faltas    = 0; // attendance detalhada carregada abaixo para o gráfico
        const derivedStats = {
          totalAlunos:  nonExp.length,
          ganhoTotal:   nonExp.reduce((s, p) => s + p.ganho_liquido_periodo, 0),
          presencas,
          faltas,
          taxaPresenca: 0  // recalculado após loadAttendancesForDashboard
        };
        this.stats.set(derivedStats);
        this.updateProfChart();
        this.loadAttendancesForDashboard(patients);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  private loadAttendancesForDashboard(patients: Patient[]): void {
    const sample = patients.slice(0, 30);
    if (!sample.length) return;

    forkJoin(sample.map(p => this.patientService.getAttendanceByPatient(p.id))).subscribe({
      next: (results) => {
        const allAtt = results.flat();
        this.attendances.set(allAtt);

        // Recalcula stats com presença/falta reais (da amostra carregada)
        // e atualiza o gráfico de rosca
        const presencas = allAtt.filter(a => a.status === 'present').length;
        const faltas    = allAtt.filter(a => a.status === 'absent').length;
        const total     = presencas + faltas;
        this.stats.update(s => ({
          ...s,
          presencas,
          faltas,
          taxaPresenca: total > 0
            ? parseFloat(((presencas / total) * 100).toFixed(2))
            : 0
        }));

        this.updateAttendanceChart(this.stats());
        this.updateProfChart();
      },
      error: () => {}
    });
  }

  // ── charts ───────────────────────────────────────────────────────────────

  setupChartOptions(): void {
    this.attendanceChartOptions = {
      responsive: true, maintainAspectRatio: false, cutout: '68%',
      plugins: {
        legend: { position: 'bottom', labels: { font: { family: 'DM Sans', size: 12 }, padding: 16 } },
        tooltip: { callbacks: { label: (ctx: any) => ` ${ctx.label}: ${ctx.parsed}` } }
      }
    };

    this.profChartOptions = {
      responsive: true, maintainAspectRatio: false, cutout: '60%',
      plugins: {
        legend: { position: 'right', labels: { font: { family: 'DM Sans', size: 11 }, padding: 14 } },
        tooltip: { callbacks: { label: (ctx: any) => ` ${ctx.label}: ${ctx.parsed.toFixed(1)}%` } }
      }
    };
  }

  updateAttendanceChart(stats: PatientStats): void {
    if (!stats.presencas && !stats.faltas) { this.attendanceChartData = null; return; }
    this.attendanceChartData = {
      labels: ['Presenças', 'Faltas'],
      datasets: [{
        data: [stats.presencas, stats.faltas],
        backgroundColor: ['rgba(90,143,90,0.85)', 'rgba(192,96,96,0.85)'],
        borderColor: ['#5a8f5a', '#c06060'],
        borderWidth: 2
      }]
    };
  }

  updateProfChart(): void {
    const ps = this.profStats();
    if (!ps.length) { this.profChartData = null; return; }
    const colors = ['#7a9e7e','#c4956a','#5a8f5a','#d4a574','#4e6e52','#b8a090','#8fb89a'];
    this.profChartData = {
      labels: ps.map(p => p.nome),
      datasets: [{
        data: ps.map(p => p.share),
        backgroundColor: colors.slice(0, ps.length),
        borderWidth: 2, borderColor: 'white'
      }]
    };
  }

  // ── utils ─────────────────────────────────────────────────────────────────

  getTodayKey(): string {
    const map: Record<number,string> = {1:'seg',2:'ter',3:'qua',4:'qui',5:'sex',6:'sab',0:'dom'};
    return map[new Date().getDay()] || '';
  }

  getTodayLabel(): string {
    return new Date().toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long' });
  }

  getSeverity(rate: number): 'success' | 'warn' | 'danger' {
    if (rate >= 80) return 'success';
    if (rate >= 60) return 'warn';
    return 'danger';
  }

  getShareBarWidth(share: number): string { return Math.max(share, 2).toFixed(1) + '%'; }
  getInitials(name: string): string { return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2); }
  getAvatarColor(name: string): string {
    const colors = ['#7a9e7e','#c4956a','#5a8f5a','#d4a574','#4e6e52'];
    return colors[name.charCodeAt(0) % colors.length];
  }
}