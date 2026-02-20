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
import { Attendance } from '../../core/models/attendance.model';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';

interface CalendarEvent  { date: Date; patients: PatientWithTime[]; dayOfWeek: string; }
interface MonthDay       { date: Date; isCurrentMonth: boolean; isToday: boolean; patients: PatientWithTime[]; }

interface PatientWithTime extends Patient {
  displayTime?: string;
  isNew?: boolean;                // iniciou nos últimos 7 dias
  lastAttendanceStatus?: 'present' | 'absent' | 'makeup' | null;
  makeupPending?: boolean;        // tem falta sem reposição registrada
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
    SelectModule, BadgeModule, TagModule, FormsModule, TooltipModule, DividerModule
  ],
  templateUrl: './calendar.component.html',
  styleUrls: ['./calendar.component.scss']
})
export class CalendarComponent implements OnInit {
  selectedDate         = signal<Date>(new Date());
  selectedProfessional = signal<number | null>(null);
  // gestor abre na semana; profissional abre no dia de hoje
  viewMode             = signal<'month' | 'week' | 'day'>('week');

  patients       = signal<Patient[]>([]);
  attendances    = signal<Attendance[]>([]);
  calendarEvents = signal<CalendarEvent[]>([]);
  monthDays      = signal<MonthDay[]>([]);

  // Gestor
  gestorViewMode    = signal<'overview' | 'detail'>('overview');
  profissionalStats = signal<ProfessionalSummary[]>([]);

  // Semana: dias vazios podem ser expandidos manualmente
  expandedDays = signal<Set<string>>(new Set());

  professionalsOptions = computed(() => [
    { label: 'Todos', value: null },
    ...this.authService.professionals().map(p => ({ label: p.nome, value: p.id }))
  ]);

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

  constructor(private patientService: PatientService, public authService: AuthService) {}

  ngOnInit(): void {
    if (!this.authService.isGestor()) {
      this.viewMode.set('day');
    }

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

  private loadAttendances(patients: Patient[]): void {
    const relevantPatients = this.authService.isGestor()
      ? patients.filter(p => this.isPatientCurrentlyActive(p))
      : patients.filter(p =>
          this.isPatientCurrentlyActive(p) &&
          p.profissional_id === Number(this.authService.getCurrentUser()?.id)
        );

    if (relevantPatients.length === 0) {
      this.generateCalendarEvents();
      if (this.authService.isGestor()) this.computeProfissionalStats();
      return;
    }

    // Limita a 20 pacientes para não sobrecarregar
    const requests = relevantPatients.slice(0, 20)
      .map(p => this.patientService.getAttendanceByPatient(p.id));

    forkJoin(requests).subscribe({
      next: (results) => {
        this.attendances.set(results.flat());
        this.generateCalendarEvents();
        if (this.authService.isGestor()) this.computeProfissionalStats();
      },
      error: () => {
        this.generateCalendarEvents();
        if (this.authService.isGestor()) this.computeProfissionalStats();
      }
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

    const lastAttendanceStatus = patientAttendances[0]?.status ?? null;

    const lastAbsent = patientAttendances.find(a => a.status === 'absent');
    const lastMakeup = patientAttendances.find(a => a.status === 'makeup');
    const makeupPending = !!lastAbsent && (
      !lastMakeup || new Date(lastAbsent.date) > new Date(lastMakeup.date)
    );

    return {
      ...p,
      displayTime: p.horarios?.[dayKey] || '',
      isNew: inicio >= sevenDaysAgo,
      lastAttendanceStatus,
      makeupPending
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

      const totalAulas    = weekDays.reduce((s, d) => s + active.filter(p => p.dias.includes(d)).length, 0);
      const diasAtivos    = weekDays.filter(d => active.some(p => p.dias.includes(d)));
      const receitaBruta  = active.reduce((s, p) => s + (p.valor || 0), 0);
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

  totalAlunosGeral  = computed(() => this.patients().filter(p => this.isPatientCurrentlyActive(p)).length);
  totalAulasSemanais = computed(() => this.profissionalStats().reduce((s, p) => s + p.totalAulas, 0));
  receitaBrutaGeral  = computed(() => this.profissionalStats().reduce((s, p) => s + p.receitaBruta, 0));
  receitaLiquidaGeral = computed(() => this.profissionalStats().reduce((s, p) => s + p.receitaLiquida, 0));

  getOcupacaoPercent(prof: ProfessionalSummary): number {
    return Math.min(Math.round((prof.totalAulas / 30) * 100), 100);
  }
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
      days.push({ date, isCurrentMonth: false, isToday: this.isToday(date), patients: this.getPatientsForDayWithTime(this.getDayKey(date)) });
    }
    for (let day = 1; day <= lastDay.getDate(); day++) {
      const date = new Date(year, month, day);
      days.push({ date, isCurrentMonth: true, isToday: this.isToday(date), patients: this.getPatientsForDayWithTime(this.getDayKey(date)) });
    }
    for (let day = 1; day <= 42 - days.length; day++) {
      const date = new Date(year, month + 1, day);
      days.push({ date, isCurrentMonth: false, isToday: this.isToday(date), patients: this.getPatientsForDayWithTime(this.getDayKey(date)) });
    }
    this.monthDays.set(days);
  }

  generateWeekView(): void {
    const events: CalendarEvent[] = [];
    const ws = this.getWeekStart(this.selectedDate());
    for (let i = 0; i < 6; i++) {
      const date = new Date(ws); date.setDate(ws.getDate() + i);
      const dayOfWeek = this.getDayKey(date);
      events.push({ date, patients: this.getPatientsForDayWithTime(dayOfWeek), dayOfWeek });
    }
    this.calendarEvents.set(events);
  }

  generateDayView(): void {
    const dayOfWeek = this.getDayKey(this.selectedDate());
    this.calendarEvents.set([{ date: this.selectedDate(), patients: this.getPatientsForDayWithTime(dayOfWeek), dayOfWeek }]);
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

  onDateSelect(d: Date):                    void { this.selectedDate.set(d);          this.generateCalendarEvents(); }
  onProfessionalChange(v: number | null):   void { this.selectedProfessional.set(v);  this.generateCalendarEvents(); }
  onViewModeChange(m: 'month'|'week'|'day'): void { this.viewMode.set(m);             this.generateCalendarEvents(); }

  previousPeriod(): void {
    const d = new Date(this.selectedDate());
    if      (this.viewMode() === 'week') d.setDate(d.getDate() - 7);
    else if (this.viewMode() === 'day')  d.setDate(d.getDate() - 1);
    else                                 d.setMonth(d.getMonth() - 1);
    this.selectedDate.set(d); this.generateCalendarEvents();
  }
  nextPeriod(): void {
    const d = new Date(this.selectedDate());
    if      (this.viewMode() === 'week') d.setDate(d.getDate() + 7);
    else if (this.viewMode() === 'day')  d.setDate(d.getDate() + 1);
    else                                 d.setMonth(d.getMonth() + 1);
    this.selectedDate.set(d); this.generateCalendarEvents();
  }
  goToToday(): void { this.selectedDate.set(new Date()); this.generateCalendarEvents(); }

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
    if (this.viewMode() === 'month') return this.monthDays().reduce((s, d) => s + d.patients.length, 0);
    return this.calendarEvents().reduce((s, e) => s + e.patients.length, 0);
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
  getAttendanceLabel(status: 'present' | 'absent' | 'makeup' | null | undefined): string {
    if (status === 'present') return 'Presente na última aula';
    if (status === 'absent')  return 'Faltou na última aula';
    if (status === 'makeup')  return 'Última foi reposição';
    return 'Sem registros';
  }

  onMonthDayClick(day: MonthDay): void {
    if (day.patients.length > 0) {
      this.selectedDate.set(day.date);
      this.viewMode.set('day');
      this.generateCalendarEvents();
    }
  }

  getProfessionalName(id: number): string { return this.authService.getProfessionalName(id); }
}