import { Component, computed, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { BadgeModule } from 'primeng/badge';
import { TagModule } from 'primeng/tag';
import { PatientService } from '../../core/services/patient.service';
import { AuthService } from '../../core/services/auth.service';
import { Patient } from '../../core/models/patient.model';
import { FormsModule } from '@angular/forms';

interface CalendarEvent { date: Date; patients: PatientWithTime[]; dayOfWeek: string; }
interface MonthDay { date: Date; isCurrentMonth: boolean; isToday: boolean; patients: PatientWithTime[]; }
interface PatientWithTime extends Patient { displayTime?: string; }

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [CommonModule, RouterLink, CardModule, ButtonModule, DatePickerModule, SelectModule, BadgeModule, TagModule, FormsModule],
  templateUrl: './calendar.component.html',
  styleUrls: ['./calendar.component.scss']
})
export class CalendarComponent implements OnInit {
  selectedDate = signal<Date>(new Date());
  selectedProfessional = signal<number | null>(null);
  viewMode = signal<'month' | 'week' | 'day'>('week');

  patients = signal<Patient[]>([]);
  calendarEvents = signal<CalendarEvent[]>([]);
  monthDays = signal<MonthDay[]>([]);

  professionalsOptions = computed(() => [
    { label: 'Todos', value: null },
    ...this.authService.professionals().map(p => ({ label: p.nome, value: p.id }))
  ]);

  viewModes: { label: string; value: 'month' | 'week' | 'day'; icon: string }[] = [
    { label: 'Mês', value: 'month', icon: 'pi pi-calendar' },
    { label: 'Semana', value: 'week', icon: 'pi pi-list' },
    { label: 'Dia', value: 'day', icon: 'pi pi-clock' }
  ];

  daysOfWeek = [
    { key: 'seg', label: 'Segunda', full: 'Segunda-feira', short: 'Seg' },
    { key: 'ter', label: 'Terça', full: 'Terça-feira', short: 'Ter' },
    { key: 'qua', label: 'Quarta', full: 'Quarta-feira', short: 'Qua' },
    { key: 'qui', label: 'Quinta', full: 'Quinta-feira', short: 'Qui' },
    { key: 'sex', label: 'Sexta', full: 'Sexta-feira', short: 'Sex' },
    { key: 'sab', label: 'Sábado', full: 'Sábado', short: 'Sáb' },
    { key: 'dom', label: 'Domingo', full: 'Domingo', short: 'Dom' }
  ];

  constructor(private patientService: PatientService, private authService: AuthService) {}

  ngOnInit(): void {
    this.patientService.loadPatients();
    this.patientService.getPatients().subscribe({
      next: (patients) => {
        this.patients.set(patients);
        this.generateCalendarEvents();
      },
      error: (err) => console.error('Erro ao carregar pacientes:', err)
    });
  }

  generateCalendarEvents(): void {
    if (this.viewMode() === 'month') this.generateMonthView();
    else if (this.viewMode() === 'week') this.generateWeekView();
    else this.generateDayView();
  }

  generateMonthView(): void {
    const days: MonthDay[] = [];
    const selectedDate = this.selectedDate();
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    let startDay = firstDay.getDay();
    startDay = startDay === 0 ? 6 : startDay - 1;
    const prevMonthLastDay = new Date(year, month, 0);
    for (let i = startDay - 1; i >= 0; i--) {
      const date = new Date(year, month - 1, prevMonthLastDay.getDate() - i);
      days.push({ date, isCurrentMonth: false, isToday: this.isToday(date), patients: this.getPatientsForDayWithTime(this.getDayKey(date)) });
    }
    for (let day = 1; day <= lastDay.getDate(); day++) {
      const date = new Date(year, month, day);
      days.push({ date, isCurrentMonth: true, isToday: this.isToday(date), patients: this.getPatientsForDayWithTime(this.getDayKey(date)) });
    }
    const remainingDays = 42 - days.length;
    for (let day = 1; day <= remainingDays; day++) {
      const date = new Date(year, month + 1, day);
      days.push({ date, isCurrentMonth: false, isToday: this.isToday(date), patients: this.getPatientsForDayWithTime(this.getDayKey(date)) });
    }
    this.monthDays.set(days);
  }

  generateWeekView(): void {
    const events: CalendarEvent[] = [];
    const weekStart = this.getWeekStart(this.selectedDate());
    for (let i = 0; i < 6; i++) {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + i);
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
      const data_inicio = new Date(p.data_inicio); data_inicio.setHours(0, 0, 0, 0);
      if (data_inicio > today) return false;
      if (p.data_fim) { const data_fim = new Date(p.data_fim); data_fim.setHours(0, 0, 0, 0); if (data_fim < today) return false; }
      return true;
    });
    if (this.selectedProfessional()) patients = patients.filter(p => p.profissional_id === this.selectedProfessional());
    return patients;
  }

  getPatientsForDayWithTime(dayKey: string): PatientWithTime[] {
    return this.getPatientsForDay(dayKey)
      .map(p => ({ ...p, displayTime: p.horarios?.[dayKey] || '' }))
      .sort((a, b) => (a.displayTime || '23:59').localeCompare(b.displayTime || '23:59'));
  }

  getDayKey(date: Date): string {
    return ({ 1: 'seg', 2: 'ter', 3: 'qua', 4: 'qui', 5: 'sex', 6: 'sab', 0: 'dom' } as Record<number, string>)[date.getDay()] || '';
  }

  getDayLabel(k: string): string { return this.daysOfWeek.find(d => d.key === k)?.label ?? k.toUpperCase(); }
  getDayShortLabel(k: string): string { return this.daysOfWeek.find(d => d.key === k)?.short ?? k.toUpperCase(); }
  getDayFullLabel(k: string): string { return this.daysOfWeek.find(d => d.key === k)?.full ?? k.toUpperCase(); }

  getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
    return d;
  }

  onDateSelect(date: Date): void { this.selectedDate.set(date); this.generateCalendarEvents(); }
  onProfessionalChange(value: number | null): void { this.selectedProfessional.set(value); this.generateCalendarEvents(); }
  onViewModeChange(mode: 'month' | 'week' | 'day'): void { this.viewMode.set(mode); this.generateCalendarEvents(); }

  previousPeriod(): void {
    const d = new Date(this.selectedDate());
    if (this.viewMode() === 'week') d.setDate(d.getDate() - 7);
    else if (this.viewMode() === 'day') d.setDate(d.getDate() - 1);
    else d.setMonth(d.getMonth() - 1);
    this.selectedDate.set(d); this.generateCalendarEvents();
  }

  nextPeriod(): void {
    const d = new Date(this.selectedDate());
    if (this.viewMode() === 'week') d.setDate(d.getDate() + 7);
    else if (this.viewMode() === 'day') d.setDate(d.getDate() + 1);
    else d.setMonth(d.getMonth() + 1);
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
    if (this.viewMode() === 'day') return date.toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
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

  getInitials(name: string): string { return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2); }
  getAvatarColor(name: string): string {
    const colors = ['#7a9e7e', '#c4956a', '#5a8f5a', '#d4a574', '#4e6e52'];
    return colors[name.charCodeAt(0) % colors.length];
  }

  onMonthDayClick(day: MonthDay): void {
    if (day.patients.length > 0) { this.selectedDate.set(day.date); this.viewMode.set('day'); this.generateCalendarEvents(); }
  }

  getProfessionalName(id: number): string { return this.authService.getProfessionalName(id); }
}