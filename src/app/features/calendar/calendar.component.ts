import { Component, computed, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { BadgeModule } from 'primeng/badge';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { DividerModule } from 'primeng/divider';
import { PatientService } from '../../core/services/patient.service';
import { AuthService } from '../../core/services/auth.service';
import { Patient } from '../../core/models/patient.model';
import { Attendance, AvulsoAttendance, PendingMakeup, ResolveRepostoFormData } from '../../core/models/attendance.model';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { DialogModule } from 'primeng/dialog';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';

interface CalendarEvent  { date: Date; patients: PatientWithTime[]; avulsos: AvulsoAttendance[]; dayOfWeek: string; }
interface MonthDay       { date: Date; isCurrentMonth: boolean; isToday: boolean; patients: PatientWithTime[]; avulsos: AvulsoAttendance[]; }

interface PatientWithTime extends Patient {
  displayTime?: string;
  isNew?: boolean;
  isExp?: boolean;
  lastAttendanceStatus?: 'present' | 'absent' | 'makeup' | null;
  makeupPending?: boolean;
  isLastReposto?: boolean;      // última presença foi uma reposição realizada
  makeupOriginDate?: Date;      // data da falta original que originou a reposição
}

interface ProfessionalSummary {
  id: string;
  nome: string;
  totalAlunos: number;
  totalAulas: number;
  receitaBruta: number;
  receitaLiquida: number;
  diasAtivos: string[];
  patients: PatientWithTime[];
}

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [
    CommonModule, RouterLink, CardModule, ButtonModule, DatePickerModule,
    SelectModule, BadgeModule, TagModule, FormsModule, TooltipModule, DividerModule,
    DialogModule, ToastModule
  ],
  providers: [MessageService],
  templateUrl: './calendar.component.html',
  styleUrls: ['./calendar.component.scss']
})
export class CalendarComponent implements OnInit {
  selectedDate         = signal<Date>(new Date());
  selectedProfessional = signal<number | null>(null);
  viewMode             = signal<'month' | 'week' | 'day'>('week');

  patients       = signal<Patient[]>([]);
  attendances    = signal<Attendance[]>([]);
  avulsos        = signal<AvulsoAttendance[]>([]);   // ← avulsas do período visível
  calendarEvents = signal<CalendarEvent[]>([]);
  monthDays      = signal<MonthDay[]>([]);

  gestorViewMode    = signal<'overview' | 'detail'>('overview');
  profissionalStats = signal<ProfessionalSummary[]>([]);
  expandedDays      = signal<Set<string>>(new Set());

  // ── Reposição ──
  pendingMakeups    = signal<PendingMakeup[]>([]);
  showRepostoDialog = signal(false);
  savingReposto     = signal(false);
  repostoStep       = signal<'select-student' | 'select-makeup'>('select-makeup');
  repostoPatient    = signal<PatientWithTime | null>(null);
  selectedMakeupId  = signal<string | null>(null);

  professionalsOptions = computed(() => [
    { label: 'Todos', value: null },
    ...this.authService.professionals().map(p => ({ label: p.nome, value: p.id }))
  ]);

  // Alunos com ao menos uma falta pendente (para passo 1 do dialog)
  studentsWithPendingMakeups = computed(() => {
    const map = new Map<string, { id: string; nome: string; qtd: number }>();
    for (const m of this.pendingMakeups()) {
      const key = String(m.patient_id);
      const cur = map.get(key);
      if (cur) cur.qtd++;
      else map.set(key, { id: key, nome: m.patient_nome, qtd: 1 });
    }
    return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome));
  });

  // Faltas do aluno selecionado no dialog (passo 2)
  makeupsPorAluno = computed(() => {
    const patient = this.repostoPatient();
    if (!patient) return this.pendingMakeups();
    return this.pendingMakeups().filter(m => String(m.patient_id) === String(patient.id));
  });

  viewModes: { label: string; value: 'month' | 'week' | 'day'; icon: string }[] = [
    { label: 'Mês',    value: 'month', icon: 'pi pi-calendar' },
    { label: 'Semana', value: 'week',  icon: 'pi pi-list'     },
    { label: 'Dia',    value: 'day',   icon: 'pi pi-clock'    }
  ];

  daysOfWeek = [
    { key: 'seg', label: 'Segunda', full: 'Segunda-feira', short: 'Seg' },
    { key: 'ter', label: 'Terça',   full: 'Terça-feira',   short: 'Ter' },
    { key: 'qua', label: 'Quarta',  full: 'Quarta-feira',  short: 'Qua' },
    { key: 'qui', label: 'Quinta',  full: 'Quinta-feira',  short: 'Qui' },
    { key: 'sex', label: 'Sexta',   full: 'Sexta-feira',   short: 'Sex' },
    { key: 'sab', label: 'Sábado',  full: 'Sábado',        short: 'Sáb' },
    { key: 'dom', label: 'Domingo', full: 'Domingo',       short: 'Dom' }
  ];

  constructor(
    private patientService: PatientService,
    public authService: AuthService,
    private messageService: MessageService
  ) {}

  ngOnInit(): void {
    if (!this.authService.isGestor()) this.viewMode.set('week');

    this.patientService.loadPatients();
    this.authService.loadProfessionals();

    this.patientService.getPatients().subscribe({
      next: (patients) => {
        this.patients.set(patients);
        this.loadAttendances(patients);
      },
      error: (err) => console.error('Erro ao carregar pacientes:', err)
    });
  }

  // ─────────────────────────────────────────────
  // CARREGAMENTO
  // ─────────────────────────────────────────────

  private loadAttendances(patients: Patient[]): void {
    const relevantPatients = this.authService.isGestor()
      ? patients.filter(p => this.isPatientCurrentlyActive(p))
      : patients.filter(p =>
          this.isPatientCurrentlyActive(p) &&
          p.profissional_id === Number(this.authService.getCurrentUser()?.id)
        );

    const loadAvulsos$ = this.patientService.getAvulsoByPeriod(
      ...this.getPeriodRange()
    );

    if (relevantPatients.length === 0) {
      loadAvulsos$.subscribe({
        next: (avulsos) => {
          this.avulsos.set(avulsos);
          this.generateCalendarEvents();
          if (this.authService.isGestor()) this.computeProfissionalStats();
        },
        error: () => {
          this.generateCalendarEvents();
          if (this.authService.isGestor()) this.computeProfissionalStats();
        }
      });
      return;
    }

    const attendanceRequests = relevantPatients.slice(0, 20)
      .map(p => this.patientService.getAttendanceByPatient(p.id));

    forkJoin([...attendanceRequests, loadAvulsos$]).subscribe({
      next: (results) => {
        // Os N-1 primeiros são Attendance[], o último é AvulsoAttendance[]
        const avulsos = results.pop() as AvulsoAttendance[];
        this.attendances.set((results as Attendance[][]).flat());
        this.avulsos.set(avulsos);
        this.generateCalendarEvents();
        if (this.authService.isGestor()) this.computeProfissionalStats();
        // Carrega reposições pendentes do período atual
        if (!this.authService.isGestor()) {
          const [startStr] = this.getPeriodRange();
          this.patientService.getPendingMakeupsList(startStr).subscribe({
            next: (list) => this.pendingMakeups.set(list),
            error: () => {}
          });
        }
      },
      error: () => {
        this.generateCalendarEvents();
        if (this.authService.isGestor()) this.computeProfissionalStats();
      }
    });
  }

  /**
   * Retorna [startDate, endDate] como strings YYYY-MM-DD
   * cobrindo o período visível atual (mês, semana ou dia).
   */
  getPeriodRange(): [string, string] {
    const d = this.selectedDate();
    const fmt = (dt: Date) => dt.toISOString().split('T')[0];

    if (this.viewMode() === 'month') {
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end   = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      return [fmt(start), fmt(end)];
    }
    if (this.viewMode() === 'week') {
      const start = this.getWeekStart(d);
      const end   = new Date(start); end.setDate(start.getDate() + 5);
      return [fmt(start), fmt(end)];
    }
    // day
    return [fmt(d), fmt(d)];
  }

  // ─────────────────────────────────────────────
  // AVULSAS: helpers
  // ─────────────────────────────────────────────

  /** Avulsas do dia informado (filtra por profissional se necessário) */
  getAvulsosForDate(date: Date): AvulsoAttendance[] {
    const dateStr = date.toISOString().split('T')[0];
    return this.avulsos().filter(a => {
      const aDate = new Date(a.date); aDate.setHours(0,0,0,0);
      const matches = aDate.toISOString().split('T')[0] === dateStr;
      if (!matches) return false;
      if (this.selectedProfessional())
        return a.profissional_id === this.selectedProfessional();
      return true;
    });
  }

  // ─────────────────────────────────────────────
  // ENRIQUECIMENTO DO PACIENTE
  // ─────────────────────────────────────────────

  private enrichPatient(p: Patient, dayKey: string): PatientWithTime {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date(today); sevenDaysAgo.setDate(today.getDate() - 7);
    const inicio = new Date(p.data_inicio); inicio.setHours(0, 0, 0, 0);

    const patientAttendances = this.attendances()
      .filter(a => a.patient_id === p.id)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const lastAtt = patientAttendances[0];
    const lastAttendanceStatus = lastAtt?.status ?? null;

    // Detecta se a última presença foi uma reposição realizada
    // (status 'present' com makeup_origin_id preenchido)
    const isLastReposto = lastAtt?.status === 'present' && !!lastAtt?.makeup_origin_id;

    // IDs dos makeups que já foram quitados por alguma presença de reposição
    const quitadosIds = new Set(
      patientAttendances
        .filter(a => a.status === 'present' && a.makeup_origin_id)
        .map(a => a.makeup_origin_id)
    );

    // Makeup pendente = existe um registro 'makeup' que ainda não foi quitado
    // (não tem nenhuma presença de reposição apontando para ele)
    const makeupPending = patientAttendances.some(
      a => a.status === 'makeup' && !quitadosIds.has(a.id)
    );

    // Data da falta original (para exibir no badge da aula reposta)
    const makeupOriginDate = isLastReposto && lastAtt?.makeup_origin_id
      ? patientAttendances.find(a => String(a.id) === String(lastAtt.makeup_origin_id))?.date
      : undefined;

    return {
      ...p,
      displayTime: p.horarios?.[dayKey] || '',
      isNew: inicio >= sevenDaysAgo,
      isExp: p.tipo === 'experimental',
      lastAttendanceStatus,
      makeupPending,
      isLastReposto,
      makeupOriginDate
    };
  }

  // ─────────────────────────────────────────────
  // GESTOR: STATS
  // ─────────────────────────────────────────────

  computeProfissionalStats(): void {
    const weekDays = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
    const stats: ProfessionalSummary[] = this.authService.professionals().map(prof => {
      const active = this.patients()
        .filter(p => p.profissional_id === Number(prof.id) && this.isPatientCurrentlyActive(p));

      const totalAulas     = weekDays.reduce((s, d) => s + active.filter(p => p.dias.includes(d)).length, 0);
      const diasAtivos     = weekDays.filter(d => active.some(p => p.dias.includes(d)));
      const receitaBruta   = active.reduce((s, p) => s + (p.valor || 0), 0);
      const receitaLiquida = active.reduce((s, p) => s + (p.ganho || 0), 0);

      return {
        id: prof.id, nome: prof.nome,
        totalAlunos: active.length, totalAulas, receitaBruta, receitaLiquida,
        diasAtivos,
        patients: active.map(p => this.enrichPatient(p, 'seg'))
      };
    });
    this.profissionalStats.set(stats.sort((a, b) => b.totalAulas - a.totalAulas));
  }

  isPatientCurrentlyActive(p: Patient): boolean {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const inicio = new Date(p.data_inicio); inicio.setHours(0, 0, 0, 0);
    if (inicio > today) return false;
    if (p.data_fim) {
      const fim = new Date(p.data_fim); fim.setHours(0, 0, 0, 0);
      if (fim < today) return false;
    }
    return true;
  }

  totalAlunosGeral    = computed(() => this.patients().filter(p => this.isPatientCurrentlyActive(p)).length);
  totalAulasSemanais  = computed(() => this.profissionalStats().reduce((s, p) => s + p.totalAulas, 0));
  receitaBrutaGeral   = computed(() => this.profissionalStats().reduce((s, p) => s + p.receitaBruta, 0));
  receitaLiquidaGeral = computed(() => this.profissionalStats().reduce((s, p) => s + p.receitaLiquida, 0));

  getOcupacaoPercent(prof: ProfessionalSummary): number { return Math.min(Math.round((prof.totalAulas / 30) * 100), 100); }
  getOcupacaoSeverity(pct: number): string {
    if (pct >= 80) return 'success';
    if (pct >= 40) return 'warning';
    return 'danger';
  }

  getPatientsForProfissionalOnDay(profId: string, dayKey: string): PatientWithTime[] {
    return this.getPatientsForDayWithTime(dayKey).filter(p => p.profissional_id === Number(profId));
  }

  drillDownProfissional(profId: string): void {
    this.selectedProfessional.set(Number(profId));
    this.gestorViewMode.set('detail');
    this.generateCalendarEvents();
  }
  backToOverview(): void {
    this.selectedProfessional.set(null);
    this.gestorViewMode.set('overview');
    this.generateCalendarEvents();
  }
  getSelectedProfNome(): string {
    const id = this.selectedProfessional();
    if (!id) return '';
    return this.profissionalStats().find(p => Number(p.id) === id)?.nome ?? '';
  }

  // ─────────────────────────────────────────────
  // PROFISSIONAL: MÉTRICAS RÁPIDAS
  // ─────────────────────────────────────────────

  getTodayPatients(): PatientWithTime[] {
    return this.getPatientsForDayWithTime(this.getDayKey(new Date()));
  }

  getMakeupPendingCount(): number {
    const seen = new Set<string>();
    let count = 0;
    for (const day of ['seg', 'ter', 'qua', 'qui', 'sex', 'sab']) {
      for (const p of this.getPatientsForDayWithTime(day)) {
        if (p.makeupPending && !seen.has(p.id)) { seen.add(p.id); count++; }
      }
    }
    return count;
  }

  getUnmarkedTodayCount(): number {
    const todayPatients = this.getTodayPatients();
    if (!todayPatients.length) return 0;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const markedToday = new Set(
      this.attendances()
        .filter(a => { const d = new Date(a.date); d.setHours(0,0,0,0); return d.getTime() === today.getTime(); })
        .map(a => a.patient_id)
    );
    return todayPatients.filter(p => !markedToday.has(p.id)).length;
  }

  // ─────────────────────────────────────────────
  // SEMANA: COLAPSO DE DIAS VAZIOS
  // ─────────────────────────────────────────────

  isDayExpanded(dayKey: string, hasPatients: boolean): boolean {
    return hasPatients || this.expandedDays().has(dayKey);
  }
  toggleDay(dayKey: string): void {
    const s = new Set(this.expandedDays());
    if (s.has(dayKey)) s.delete(dayKey); else s.add(dayKey);
    this.expandedDays.set(s);
  }

  // ─────────────────────────────────────────────
  // CALENDAR EVENTS
  // ─────────────────────────────────────────────

  generateCalendarEvents(): void {
    if (this.viewMode() === 'month')     this.generateMonthView();
    else if (this.viewMode() === 'week') this.generateWeekView();
    else                                 this.generateDayView();
  }

  generateMonthView(): void {
    const days: MonthDay[] = [];
    const d = this.selectedDate();
    const year = d.getFullYear(), month = d.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay  = new Date(year, month + 1, 0);
    let startDay = firstDay.getDay();
    startDay = startDay === 0 ? 6 : startDay - 1;
    const prevLast = new Date(year, month, 0);
    for (let i = startDay - 1; i >= 0; i--) {
      const date = new Date(year, month - 1, prevLast.getDate() - i);
      days.push({ date, isCurrentMonth: false, isToday: this.isToday(date), patients: this.getPatientsForDayWithTime(this.getDayKey(date)), avulsos: this.getAvulsosForDate(date) });
    }
    for (let day = 1; day <= lastDay.getDate(); day++) {
      const date = new Date(year, month, day);
      days.push({ date, isCurrentMonth: true, isToday: this.isToday(date), patients: this.getPatientsForDayWithTime(this.getDayKey(date)), avulsos: this.getAvulsosForDate(date) });
    }
    for (let day = 1; day <= 42 - days.length; day++) {
      const date = new Date(year, month + 1, day);
      days.push({ date, isCurrentMonth: false, isToday: this.isToday(date), patients: this.getPatientsForDayWithTime(this.getDayKey(date)), avulsos: this.getAvulsosForDate(date) });
    }
    this.monthDays.set(days);
  }

  generateWeekView(): void {
    const events: CalendarEvent[] = [];
    const ws = this.getWeekStart(this.selectedDate());
    for (let i = 0; i < 6; i++) {
      const date = new Date(ws); date.setDate(ws.getDate() + i);
      const dayOfWeek = this.getDayKey(date);
      events.push({ date, patients: this.getPatientsForDayWithTime(dayOfWeek), avulsos: this.getAvulsosForDate(date), dayOfWeek });
    }
    this.calendarEvents.set(events);
  }

  generateDayView(): void {
    const dayOfWeek = this.getDayKey(this.selectedDate());
    this.calendarEvents.set([{
      date: this.selectedDate(),
      patients: this.getPatientsForDayWithTime(dayOfWeek),
      avulsos: this.getAvulsosForDate(this.selectedDate()),
      dayOfWeek
    }]);
  }

  getPatientsForDay(dayKey: string): Patient[] {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let patients = this.patients().filter(p => {
      if (!p.dias.includes(dayKey)) return false;
      const inicio = new Date(p.data_inicio); inicio.setHours(0, 0, 0, 0);
      if (inicio > today) return false;
      if (p.data_fim) { const fim = new Date(p.data_fim); fim.setHours(0,0,0,0); if (fim < today) return false; }
      return true;
    });
    if (this.selectedProfessional())
      patients = patients.filter(p => p.profissional_id === this.selectedProfessional());
    return patients;
  }

  getPatientsForDayWithTime(dayKey: string): PatientWithTime[] {
    return this.getPatientsForDay(dayKey)
      .map(p => this.enrichPatient(p, dayKey))
      .sort((a, b) => (a.displayTime || '23:59').localeCompare(b.displayTime || '23:59'));
  }

  getDayKey(date: Date): string {
    return ({ 1:'seg', 2:'ter', 3:'qua', 4:'qui', 5:'sex', 6:'sab', 0:'dom' } as Record<number,string>)[date.getDay()] || '';
  }

  getDayLabel(k: string):      string { return this.daysOfWeek.find(d => d.key === k)?.label ?? k.toUpperCase(); }
  getDayShortLabel(k: string): string { return this.daysOfWeek.find(d => d.key === k)?.short ?? k.toUpperCase(); }
  getDayFullLabel(k: string):  string { return this.daysOfWeek.find(d => d.key === k)?.full  ?? k.toUpperCase(); }

  getWeekStart(date: Date): Date {
    const d = new Date(date), day = d.getDay();
    d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
    return d;
  }

  onDateSelect(d: Date): void {
    this.selectedDate.set(d);
    this.avulsos.set([]); // limpa para recarregar no novo período
    this.loadAttendances(this.patients());
  }
  onProfessionalChange(v: number | null): void { this.selectedProfessional.set(v); this.generateCalendarEvents(); }
  onViewModeChange(m: 'month'|'week'|'day'): void {
    this.viewMode.set(m);
    this.avulsos.set([]);
    this.loadAttendances(this.patients());
  }

  previousPeriod(): void {
    const d = new Date(this.selectedDate());
    if      (this.viewMode() === 'week') d.setDate(d.getDate() - 7);
    else if (this.viewMode() === 'day')  d.setDate(d.getDate() - 1);
    else                                 d.setMonth(d.getMonth() - 1);
    this.selectedDate.set(d);
    this.avulsos.set([]);
    this.loadAttendances(this.patients());
  }
  nextPeriod(): void {
    const d = new Date(this.selectedDate());
    if      (this.viewMode() === 'week') d.setDate(d.getDate() + 7);
    else if (this.viewMode() === 'day')  d.setDate(d.getDate() + 1);
    else                                 d.setMonth(d.getMonth() + 1);
    this.selectedDate.set(d);
    this.avulsos.set([]);
    this.loadAttendances(this.patients());
  }
  goToToday(): void {
    this.selectedDate.set(new Date());
    this.avulsos.set([]);
    this.loadAttendances(this.patients());
  }

  getPeriodLabel(): string {
    const date = this.selectedDate();
    if (this.viewMode() === 'week') {
      const ws = this.getWeekStart(date);
      const we = new Date(ws); we.setDate(ws.getDate() + 5);
      const sm = ws.toLocaleDateString('pt-BR', { month: 'short' });
      const em = we.toLocaleDateString('pt-BR', { month: 'short' });
      return sm === em
        ? `${ws.getDate()}-${we.getDate()} de ${sm} ${ws.getFullYear()}`
        : `${ws.getDate()} ${sm} - ${we.getDate()} ${em} ${ws.getFullYear()}`;
    }
    if (this.viewMode() === 'day')
      return date.toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    return date.toLocaleDateString('pt-BR', { year: 'numeric', month: 'long' });
  }

  getTotalClasses(): number {
    if (this.viewMode() === 'month')
      return this.monthDays().reduce((s, d) => s + d.patients.length + d.avulsos.length, 0);
    return this.calendarEvents().reduce((s, e) => s + e.patients.length + e.avulsos.length, 0);
  }

  isToday(date: Date): boolean {
    const t = new Date();
    return date.getDate() === t.getDate() && date.getMonth() === t.getMonth() && date.getFullYear() === t.getFullYear();
  }

  getInitials(name: string): string {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
  }
  getAvatarColor(name: string): string {
    const colors = ['#7a9e7e', '#c4956a', '#5a8f5a', '#d4a574', '#4e6e52'];
    return colors[name.charCodeAt(0) % colors.length];
  }

  getAttendanceIcon(status: 'present' | 'absent' | 'makeup' | null | undefined): string {
    if (status === 'present') return 'pi pi-check-circle';
    if (status === 'absent')  return 'pi pi-times-circle';
    if (status === 'makeup')  return 'pi pi-replay';
    return 'pi pi-minus-circle';
  }
  getAttendanceClass(status: 'present' | 'absent' | 'makeup' | null | undefined): string {
    if (status === 'present') return 'att-present';
    if (status === 'absent')  return 'att-absent';
    if (status === 'makeup')  return 'att-makeup';
    return 'att-none';
  }
  getAttendanceLabel(status: 'present' | 'absent' | 'makeup' | null | undefined, isLastReposto?: boolean): string {
    if (status === 'present') return isLastReposto ? 'Presente — foi reposição' : 'Presente na última aula';
    if (status === 'absent')  return 'Faltou na última aula';
    if (status === 'makeup')  return 'Falta pendente de reposição';
    return 'Sem registros';
  }

  onMonthDayClick(day: MonthDay): void {
    if (day.patients.length > 0 || day.avulsos.length > 0) {
      this.selectedDate.set(day.date);
      this.viewMode.set('day');
      this.avulsos.set([]);
      this.loadAttendances(this.patients());
    }
  }

  getProfessionalName(id: number): string { return this.authService.getProfessionalName(id); }

  // ─────────────────────────────────────────────
  // REPOSIÇÃO — dialog
  // ─────────────────────────────────────────────

  openRepostoDialog(patient: PatientWithTime | null): void {
    this.selectedMakeupId.set(null);
    if (patient) {
      this.repostoPatient.set(patient);
      this.repostoStep.set('select-makeup');
    } else {
      this.repostoPatient.set(null);
      this.repostoStep.set('select-student');
    }
    this.showRepostoDialog.set(true);
  }

  selectStudentForReposto(patientId: string): void {
    const patient = this.studentsWithPendingMakeups().find(s => s.id === patientId);
    if (!patient) return;
    // Busca o PatientWithTime completo para ter todos os campos
    const full = this.patients().find(p => String(p.id) === patientId);
    if (full) {
      this.repostoPatient.set(this.enrichPatient(full, this.getDayKey(this.selectedDate())));
    }
    this.selectedMakeupId.set(null);
    this.repostoStep.set('select-makeup');
  }

  backToSelectStudent(): void {
    this.repostoPatient.set(null);
    this.selectedMakeupId.set(null);
    this.repostoStep.set('select-student');
  }

  confirmReposto(): void {
    const makeupId = this.selectedMakeupId();
    const patient  = this.repostoPatient();
    if (!makeupId || !patient) return;

    this.savingReposto.set(true);
    const presentDate = this.getDateString(this.selectedDate());

    const data: ResolveRepostoFormData = {
      makeupId,
      presentPatientId: patient.id,
      presentDate
    };

    this.patientService.resolveReposto(data).subscribe({
      next: () => {
        this.pendingMakeups.update(list => list.filter(m => m.id !== makeupId));
        this.messageService.add({
          severity: 'success',
          summary: 'Reposição registrada!',
          detail: `Presença de ${patient.nome} registrada com sucesso.`,
          life: 5000
        });
        this.savingReposto.set(false);
        this.showRepostoDialog.set(false);
        // Recarrega attendances para refletir no calendário
        this.loadAttendances(this.patients());
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: 'Erro',
          detail: 'Não foi possível registrar a reposição. Tente novamente.'
        });
        this.savingReposto.set(false);
      }
    });
  }

  getMakeupDateLabel(makeup: PendingMakeup): string {
    return new Date(makeup.date).toLocaleDateString('pt-BR', {
      weekday: 'long', day: '2-digit', month: 'long'
    });
  }

  formatOriginDate(date: Date | undefined): string {
    if (!date) return '';
    return new Date(date).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
  }

  getDateString(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  getDiasRestantesMes(): number {
    const hoje = new Date();
    const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    return Math.max(0, Math.ceil((fimMes.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)));
  }
}