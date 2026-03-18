// src/app/features/dashboard/dashboard-profissional/dashboard-profissional.component.ts
import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { BadgeModule } from 'primeng/badge';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { PatientService } from '../../../core/services/patient.service';
import { AuthService } from '../../../core/services/auth.service';
import { Patient } from '../../../core/models/patient.model';
import {
  Attendance,
  ATTENDANCE_STATUS_CONFIG,
  PendingMakeup,
} from '../../../core/models/attendance.model';
import { TooltipModule } from 'primeng/tooltip';

interface AulaHoje {
  patient: Patient;
  horario: string;
  status: 'present' | 'absent' | 'makeup' | null;
  attendanceId: string | null;
  saving: boolean;
}

/**
 * Representa um dia anterior que possui alunos sem registro de presença.
 * A seção colapsável no template itera sobre esse array.
 */
interface DiaPendente {
  /** YYYY-MM-DD */
  dateStr: string;
  /** Ex.: "ontem", "segunda-feira" */
  label: string;
  /** Lista de alunos que tinham aula e não foram registrados */
  aulas: AulaHoje[];
  /** Controla se o accordion está aberto */
  aberto: boolean;
}

@Component({
  selector: 'app-dashboard-profissional',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    TooltipModule,
    CardModule,
    ButtonModule,
    TagModule,
    BadgeModule,
    ToastModule,
  ],
  providers: [MessageService],
  templateUrl: './dashboard-profissional.component.html',
  styleUrls: ['./dashboard-profissional.component.scss'],
})
export class DashboardProfissionalComponent implements OnInit {
  loading = signal(true);
  savingId = signal<string | null>(null);
  userName = signal('');
  hoje = new Date();
  aulaHoje = signal<AulaHoje[]>([]);
  totalAlunos = signal(0);
  ganhoMes = signal(0);
  periodoLabel = '';

  /** Lista de reposições pendentes no mês (makeup com reposto=false) */
  pendingMakeups = signal<PendingMakeup[]>([]);

  /**
   * Dias anteriores com aulas sem registro.
   * Preenchido por `verificarDiasAnteriores()` após carregar a lista de alunos.
   */
  diasNaoRegistrados = signal<DiaPendente[]>([]);

  /** Total de alunos sem registro em dias anteriores — usado no badge de alerta */
  totalNaoRegistrados = computed(() =>
    this.diasNaoRegistrados().reduce((sum, d) => sum + d.aulas.length, 0),
  );

  /** Helper: dias restantes no mês atual */
  get diasRestantesMes(): number {
    const lastDay = new Date(this.hoje.getFullYear(), this.hoje.getMonth() + 1, 0).getDate();
    return lastDay - this.hoje.getDate();
  }

  /** Retorna pendências agrupadas por patient_id para uso no template */
  pendingMakeupsPorAluno = (patientId: string): PendingMakeup[] =>
    this.pendingMakeups().filter((m) => String(m.patient_id) === String(patientId));

  attendanceConfig = ATTENDANCE_STATUS_CONFIG;

  readonly diasSemana: Record<number, string> = {
    1: 'seg',
    2: 'ter',
    3: 'qua',
    4: 'qui',
    5: 'sex',
    6: 'sab',
    0: 'dom',
  };

  readonly nomeDia: Record<string, string> = {
    seg: 'Segunda-feira',
    ter: 'Terça-feira',
    qua: 'Quarta-feira',
    qui: 'Quinta-feira',
    sex: 'Sexta-feira',
    sab: 'Sábado',
    dom: 'Domingo',
  };

  diaKey = computed(() => this.diasSemana[this.hoje.getDay()] ?? '');
  pendentes = computed(() => this.aulaHoje().filter((a) => !a.status).length);
  presentes = computed(() => this.aulaHoje().filter((a) => a.status === 'present').length);
  faltas = computed(() => this.aulaHoje().filter((a) => a.status === 'absent').length);

  saudacao = computed(() => {
    const h = this.hoje.getHours();
    if (h < 12) return 'Bom dia';
    if (h < 18) return 'Boa tarde';
    return 'Boa noite';
  });

  constructor(
    private patientService: PatientService,
    private authService: AuthService,
    private messageService: MessageService,
  ) {}

  ngOnInit(): void {
    const user = this.authService.getCurrentUser();
    if (user) this.userName.set(user.nome.split(' ')[0]);

    const { start, end } = PatientService.monthRange(this.hoje);
    this.periodoLabel = this.hoje.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

    this.patientService.getPatientsByPeriod(start, end).subscribe({
      next: (patients) => {
        const meusAtivos = patients.filter((p) => p.profissional_id === Number(user?.id));
        const meusPagantes = meusAtivos.filter((p) => p.tipo !== 'experimental');

        this.totalAlunos.set(meusPagantes.length);
        this.ganhoMes.set(meusPagantes.reduce((s, p) => s + p.ganho_liquido_periodo, 0));

        const dayKey = this.diaKey();
        const aulasDeHoje = meusAtivos
          .filter((p) => p.dias.includes(dayKey))
          .filter((p) => {
            return p.data_fim ? p.data_fim === null || new Date(p.data_fim) >= this.hoje : true;
          })
          .map((p) => ({
            patient: p,
            horario: p.horarios?.[dayKey] || '',
            status: null as AulaHoje['status'],
            attendanceId: null,
            saving: false,
          }))
          .sort((a, b) => (a.horario || '23:59').localeCompare(b.horario || '23:59'));

        this.aulaHoje.set(aulasDeHoje);
        this.carregarFrequenciasDeHoje(aulasDeHoje);

        // ── NOVO: verifica dias anteriores sem registro ────────────────────
        // Passa todos os alunos ativos para cruzar com os attendances de cada dia.
        this.verificarDiasAnteriores(meusAtivos);
        // ─────────────────────────────────────────────────────────────────

        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DETECÇÃO DE DIAS ANTERIORES NÃO REGISTRADOS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Calcula os últimos N dias úteis (excluindo hoje e domingo) e verifica,
   * para cada um, quais alunos tinham aula mas não têm attendance registrado.
   *
   * Por que forkJoin?
   * Precisamos de N chamadas a getAttendanceByDate em paralelo e só processar
   * o resultado quando todas chegarem. forkJoin é exatamente isso: dispara
   * todos os observables simultaneamente e emite um único array com os resultados
   * na mesma ordem em que foram criados.
   *
   * Por que catchError no pipe de cada requisição?
   * Se um dia falhar (ex.: erro 500 pontual), não queremos cancelar toda a verificação.
   * catchError por observable individual retorna [] para aquele dia e deixa os demais.
   */
  private verificarDiasAnteriores(todosAlunos: Patient[]): void {
    const diasParaVerificar = this.calcularDiasUteisPrevios(7);

    if (diasParaVerificar.length === 0) return;

    // Dispara uma requisição por dia, todas em paralelo
    const requisicoes = diasParaVerificar.map((dia) =>
      this.patientService
        .getAttendanceByDate(dia.dateStr)
        .pipe(catchError(() => of([] as Attendance[]))),
    );

    forkJoin(requisicoes).subscribe({
      next: (resultados) => {
        const diasComPendencia: DiaPendente[] = [];

        resultados.forEach((attendances, index) => {
          const dia = diasParaVerificar[index];
          const registradosIds = new Set(attendances.map((a) => String(a.patient_id)));

          // Filtra alunos que tinham aula nesse dia e não foram registrados
          const aulasSemRegistro = todosAlunos
            .filter((p) => p.dias.includes(dia.dayKey))
            .filter((p) => !registradosIds.has(String(p.id)))
            .filter((p) => {
              // Aluno precisava estar ativo nesse dia específico
              const dataVerificacao = new Date(dia.dateStr + 'T12:00:00');
              const inicio = p.data_inicio ? new Date(p.data_inicio) : null;
              const fim = p.data_fim ? new Date(p.data_fim) : null;
              if (inicio && dataVerificacao < inicio) return false;
              if (fim && dataVerificacao > fim) return false;
              return true;
            })
            .map((p) => ({
              patient: p,
              horario: p.horarios?.[dia.dayKey] || '',
              status: null as AulaHoje['status'],
              attendanceId: null,
              saving: false,
            }))
            .sort((a, b) => (a.horario || '23:59').localeCompare(b.horario || '23:59'));

          if (aulasSemRegistro.length > 0) {
            diasComPendencia.push({
              dateStr: dia.dateStr,
              label: dia.label,
              aulas: aulasSemRegistro,
              // Abre automaticamente só o dia mais recente (index 0)
              aberto: diasComPendencia.length === 0,
            });
          }
        });

        this.diasNaoRegistrados.set(diasComPendencia);
      },
    });
  }

  /**
   * Retorna até `maxDias` dias anteriores úteis (sem domingo, sem hoje).
   * Resultado é ordenado do mais recente ao mais antigo.
   *
   * Cada item traz: dateStr (YYYY-MM-DD), dayKey (seg/ter/...) e label legível.
   */
  private calcularDiasUteisPrevios(
    maxDias: number,
  ): { dateStr: string; dayKey: string; label: string }[] {
    const resultado: { dateStr: string; dayKey: string; label: string }[] = [];
    const cursor = new Date(this.hoje);

    // "ontem" é o primeiro candidato
    cursor.setDate(cursor.getDate() - 1);

    while (resultado.length < maxDias) {
      const diaSemana = cursor.getDay();

      // Pula domingo (0) — normalmente sem aulas
      if (diaSemana !== 0) {
        const dateStr = cursor.toISOString().split('T')[0];
        const dayKey = this.diasSemana[diaSemana] ?? '';

        // Label amigável: "ontem" para o dia imediatamente anterior, nome do dia para os demais
        const diffDias = Math.round(
          (this.hoje.setHours(0, 0, 0, 0) - new Date(dateStr).setHours(0, 0, 0, 0)) /
            (1000 * 60 * 60 * 24),
        );
        const label =
          diffDias === 1
            ? 'Ontem'
            : cursor.toLocaleDateString('pt-BR', {
                weekday: 'long',
                day: 'numeric',
                month: 'short',
              });

        resultado.push({ dateStr, dayKey, label });
      }

      cursor.setDate(cursor.getDate() - 1);

      // Segurança: nunca olha mais de 30 dias para trás
      const limite = new Date(this.hoje);
      limite.setDate(limite.getDate() - 30);
      if (cursor < limite) break;
    }

    return resultado;
  }

  /** Alterna abertura/fechamento de um dia no accordion de pendentes */
  toggleDiaPendente(index: number): void {
    this.diasNaoRegistrados.update((dias) =>
      dias.map((d, i) => (i === index ? { ...d, aberto: !d.aberto } : d)),
    );
  }

  /**
   * Registra frequência para um aluno em uma data passada (dias não registrados).
   * Funciona exatamente como marcarFrequencia(), mas recebe a data como parâmetro
   * em vez de usar this.hoje.
   *
   * Após salvar, remove o aluno da lista daquele dia.
   * Se o dia ficar vazio, remove o dia inteiro do signal.
   */
  marcarFrequenciaPassada(
    diaPendenteIndex: number,
    aula: AulaHoje,
    status: 'present' | 'absent' | 'makeup',
  ): void {
    if (aula.status === status) return;

    const dia = this.diasNaoRegistrados()[diaPendenteIndex];
    if (!dia) return;

    this.savingId.set(`${dia.dateStr}-${aula.patient.id}`);
    const formData = { date: new Date(dia.dateStr + 'T12:00:00'), status, notes: '' };

    const op$ = aula.attendanceId
      ? this.patientService.updateAttendance(aula.patient.id, aula.attendanceId, formData)
      : this.patientService.addAttendance(aula.patient.id, formData);

    op$.subscribe({
      next: () => {
        // Remove o aluno registrado da lista do dia
        this.diasNaoRegistrados.update((dias) => {
          const novosDias = dias
            .map((d, i) =>
              i === diaPendenteIndex
                ? { ...d, aulas: d.aulas.filter((a) => a.patient.id !== aula.patient.id) }
                : d,
            )
            // Remove dias que ficaram vazios
            .filter((d) => d.aulas.length > 0);
          return novosDias;
        });

        this.messageService.add({
          severity: 'success',
          summary: 'Registrado',
          detail: `${aula.patient.nome} — ${status === 'present' ? 'Presente' : status === 'absent' ? 'Falta' : 'Reposição'} em ${dia.label}`,
          life: 3000,
        });

        this.savingId.set(null);
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: 'Erro',
          detail: 'Não foi possível registrar',
        });
        this.savingId.set(null);
      },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FREQUÊNCIA DO DIA ATUAL (lógica existente — sem alterações)
  // ─────────────────────────────────────────────────────────────────────────

  private carregarFrequenciasDeHoje(aulas: AulaHoje[]): void {
    const dateStr = this.hoje.toISOString().split('T')[0];
    this.patientService.getAttendanceByDate(dateStr).subscribe({
      next: (attendances: Attendance[]) => {
        this.aulaHoje.update((list) =>
          list.map((a) => {
            const found = attendances.find((att) => att.patient_id === a.patient.id);
            return found
              ? { ...a, status: found.status as AulaHoje['status'], attendanceId: found.id }
              : a;
          }),
        );
        this.patientService.getPendingMakeupsList(dateStr).subscribe({
          next: (list) => this.pendingMakeups.set(list),
          error: () => {},
        });
      },
      error: () => {},
    });
  }

  marcarFrequencia(aula: AulaHoje, status: 'present' | 'absent' | 'makeup'): void {
    if (aula.status === status) return;

    this.savingId.set(aula.patient.id);
    const dateStr = this.hoje.toISOString().split('T')[0];
    const formData = { date: new Date(dateStr), status, notes: '' };

    const op$ = aula.attendanceId
      ? this.patientService.updateAttendance(aula.patient.id, aula.attendanceId, formData)
      : this.patientService.addAttendance(aula.patient.id, formData);

    op$.subscribe({
      next: (saved: Attendance) => {
        this.aulaHoje.update((list) =>
          list.map((a) =>
            a.patient.id === aula.patient.id
              ? {
                  ...a,
                  status: saved.status as AulaHoje['status'],
                  attendanceId: saved.id,
                  saving: false,
                }
              : a,
          ),
        );

        this.patientService.getPendingMakeupsList(dateStr).subscribe({
          next: (list) => {
            this.pendingMakeups.set(list);
            const pendentesDoAluno = list.filter(
              (m) => String(m.patient_id) === String(aula.patient.id),
            );
            if (pendentesDoAluno.length > 0) {
              const qtd = pendentesDoAluno.length;
              const diasRest = this.diasRestantesMes;
              const diasTxt =
                diasRest === 0
                  ? 'hoje é o último dia!'
                  : diasRest === 1
                    ? 'falta apenas 1 dia'
                    : `faltam ${diasRest} dias`;
              const repoTxt = qtd === 1 ? '1 reposição pendente' : `${qtd} reposições pendentes`;
              this.messageService.add({
                severity: 'warn',
                summary: `⚠️ Reposição pendente — ${aula.patient.nome}`,
                detail: `${aula.patient.nome} tem ${repoTxt} neste mês. Prazo: ${diasTxt} para o fim do mês.`,
                life: 8000,
              });
            }
          },
          error: () => {},
        });

        this.savingId.set(null);
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: 'Erro',
          detail: 'Não foi possível registrar',
        });
        this.savingId.set(null);
      },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // UTILITÁRIOS DE TEMPLATE
  // ─────────────────────────────────────────────────────────────────────────

  getInitials(name: string): string {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  }

  getAvatarColor(name: string): string {
    return ['#7a9e7e', '#c4956a', '#5a8f5a', '#d4a574', '#4e6e52'][name.charCodeAt(0) % 5];
  }

  get dataHoje(): string {
    return this.hoje.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  }

  /**
   * Chave de savingId para aulas de dias passados.
   * Combina data + patientId para não colidir com o savingId das aulas de hoje.
   */
  isSavingPassado(dateStr: string, patientId: string): boolean {
    return this.savingId() === `${dateStr}-${patientId}`;
  }
}
