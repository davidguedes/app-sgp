import { Component, computed, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { PatientService } from '../../core/services/patient.service';
import { AuthService } from '../../core/services/auth.service';
import { Patient } from '../../core/models/patient.model';
import { Attendance, AttendanceFormData, ATTENDANCE_STATUS_CONFIG } from '../../core/models/attendance.model';
import { forkJoin } from 'rxjs';

interface PatientAttendance extends Patient {
  todayStatus?: 'present' | 'absent' | 'makeup' | null;
  todayAttendanceId?: string;
  hasClass: boolean;
}

@Component({
  selector: 'app-attendance',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, CardModule, ButtonModule, DatePickerModule, SelectModule, SelectButtonModule, ToastModule],
  providers: [MessageService],
  templateUrl: './attendance.component.html',
  styleUrls: ['./attendance.component.scss']
})
export class AttendanceComponent implements OnInit {
  selectedDate = signal<Date>(new Date());
  selectedProfessional = signal<number | null>(null);
  showMarkedStudents = signal<boolean>(false);

  patients = signal<PatientAttendance[]>([]);
  filteredPatients = signal<PatientAttendance[]>([]);
  loading = signal(false);
  saving = signal(false);

  professionalsOptions = computed(() => [
    { label: 'Todos', value: null },
    ...this.authService.professionals().map(p => ({ label: p.nome, value: p.id }))
  ]);

  statusOptions = [
    { label: 'Presente', value: 'present', icon: 'pi pi-check' },
    { label: 'Faltou',   value: 'absent',  icon: 'pi pi-times' },
    { label: 'Reposição', value: 'makeup', icon: 'pi pi-replay' }
  ];

  viewModeOptions = [
    { label: 'Pendentes', value: false, icon: 'pi pi-clock' },
    { label: 'Todos',     value: true,  icon: 'pi pi-list' }
  ];

  attendanceConfig = ATTENDANCE_STATUS_CONFIG;

  constructor(
    private patientService: PatientService,
    private authService: AuthService,
    private messageService: MessageService
  ) {}

  ngOnInit(): void {
    this.patientService.loadPatients();
    this.loadDayAttendance();
  }

  /**
   * Estratégia corrigida:
   * 1. Pega a lista leve de pacientes (sem attendance aninhado)
   * 2. Filtra quem tem aula no dia selecionado
   * 3. Faz UM único request para buscar attendance do dia — via endpoint dedicado no backend
   *
   * O endpoint GET /api/attendance?date=YYYY-MM-DD retorna todos os registros daquele dia.
   * Isso substitui o forkJoin de N requests (um por paciente).
   */
  loadDayAttendance(): void {
    this.loading.set(true);
    const dateStr = this.getDateString(this.selectedDate());

    this.patientService.getPatients().subscribe({
      next: (allPatients) => {
        const dayKey = this.getDayKey(this.selectedDate());
        const patientsWithClass = allPatients.filter(p => {
          if (!p.dias.includes(dayKey)) return false;
          const inicio = new Date(p.data_inicio); inicio.setHours(0, 0, 0, 0);
          const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
          if (inicio > hoje) return false;
          if (p.data_fim) { const fim = new Date(p.data_fim); fim.setHours(0, 0, 0, 0); if (fim < hoje) return false; }
          return true;
        });

        this.patientService.getAttendanceByDate(dateStr).subscribe({
          next: (attendanceOfDay) => {
            const attendanceMap = new Map<string, Attendance>(
              attendanceOfDay.map(a => [a.patient_id, a])
            );

            const mapped: PatientAttendance[] = patientsWithClass.map(p => {
              const att = attendanceMap.get(p.id);
              return { ...p, hasClass: true, todayStatus: att?.status ?? null, todayAttendanceId: att?.id };
            });

            this.patients.set(mapped);
            this.applyFilters();
            this.loading.set(false);
          },
          error: () => {
            this.messageService.add({ severity: 'error', summary: 'Erro', detail: 'Não foi possível carregar as frequências do dia' });
            this.loading.set(false);
          }
        });
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Erro', detail: 'Não foi possível carregar os alunos' });
        this.loading.set(false);
      }
    });
  }

  applyFilters(): void {
    let filtered = [...this.patients()];
    if (this.selectedProfessional()) filtered = filtered.filter(p => p.profissional_id === this.selectedProfessional());
    if (!this.showMarkedStudents()) filtered = filtered.filter(p => !p.todayStatus);
    this.filteredPatients.set(filtered);
  }

  onDateChange(date: Date): void { this.selectedDate.set(date); this.loadDayAttendance(); }
  onProfessionalChange(value: number | null): void { this.selectedProfessional.set(value); this.applyFilters(); }
  onViewModeChange(value: boolean): void { this.showMarkedStudents.set(value); this.applyFilters(); }

  markAttendance(patient: PatientAttendance, status: 'present' | 'absent' | 'makeup'): void {
    const formData: AttendanceFormData = { date: this.selectedDate(), status, notes: '' };
    this.saving.set(true);

    // Atualização otimista
    this._updatePatientStatus(patient.id, status);

    const request$ = patient.todayAttendanceId
      ? this.patientService.updateAttendance(patient.id, patient.todayAttendanceId, formData)
      : this.patientService.addAttendance(patient.id, formData);

    request$.subscribe({
      next: (att) => {
        // Persiste o id retornado para edições futuras na mesma sessão
        this._updatePatientStatus(patient.id, status, att.id);
        this.messageService.add({ severity: 'success', summary: 'Sucesso', detail: `${patient.nome}: frequência registrada` });
        this.saving.set(false);
      },
      error: () => {
        // Reverte otimista
        this._updatePatientStatus(patient.id, null);
        this.messageService.add({ severity: 'error', summary: 'Erro', detail: 'Não foi possível registrar a frequência' });
        this.saving.set(false);
      }
    });
  }

  clearAttendance(patient: PatientAttendance): void {
    if (!patient.todayAttendanceId) return;
    this._updatePatientStatus(patient.id, null);

    this.patientService.deleteAttendance(patient.id, patient.todayAttendanceId).subscribe({
      next: () => {
        this.messageService.add({ severity: 'info', summary: 'Removido', detail: `${patient.nome}: frequência removida` });
        this.applyFilters();
      },
      error: () => {
        this._updatePatientStatus(patient.id, patient.todayStatus ?? null, patient.todayAttendanceId);
        this.messageService.add({ severity: 'error', summary: 'Erro', detail: 'Não foi possível remover a frequência' });
      }
    });
  }

  markAllPresent(): void {
    if (!confirm('Deseja marcar todos os alunos como presente?')) return;
    const pending = this.filteredPatients().filter(p => !p.todayStatus);
    if (!pending.length) {
      this.messageService.add({ severity: 'info', summary: 'Informação', detail: 'Todos já têm frequência registrada' });
      return;
    }
    this.saving.set(true);
    const formData: AttendanceFormData = { date: this.selectedDate(), status: 'present', notes: '' };
    forkJoin(pending.map(p => this.patientService.addAttendance(p.id, formData))).subscribe({
      next: (results) => {
        results.forEach((att, i) => this._updatePatientStatus(pending[i].id, 'present', att.id));
        this.applyFilters();
        this.messageService.add({ severity: 'success', summary: 'Sucesso', detail: `${pending.length} aluno(s) marcado(s) como presente` });
        this.saving.set(false);
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Erro', detail: 'Erro ao marcar alguns alunos. Verifique e tente novamente.' });
        this.saving.set(false);
      }
    });
  }

  private _updatePatientStatus(id: string, status: 'present' | 'absent' | 'makeup' | null, attendanceId?: string): void {
    const updated = this.patients().map(p =>
      p.id === id
        ? {
            ...p,
            todayStatus: status,
            todayAttendanceId: status === null ? undefined : (attendanceId ?? p.todayAttendanceId)
          }
        : p
    );
    this.patients.set(updated);
    this.applyFilters();
  }

  getStats() {
    const studentsToCount = this.selectedProfessional()
      ? this.patients().filter(p => p.profissional_id === this.selectedProfessional())
      : this.patients();
    const total   = studentsToCount.length;
    const present = studentsToCount.filter(p => p.todayStatus === 'present').length;
    const absent  = studentsToCount.filter(p => p.todayStatus === 'absent').length;
    const makeup  = studentsToCount.filter(p => p.todayStatus === 'makeup').length;
    const pending = studentsToCount.filter(p => !p.todayStatus).length;
    return { total, present, absent, makeup, pending };
  }

  getDayKey(date: Date): string {
    return ({ 1: 'seg', 2: 'ter', 3: 'qua', 4: 'qui', 5: 'sex', 6: 'sab', 0: 'dom' } as Record<number, string>)[date.getDay()] || '';
  }

  getDateString(date: Date): string { return date.toISOString().split('T')[0]; }
  getInitials(name: string): string { return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2); }
  getAvatarColor(name: string): string {
    return ['#7a9e7e', '#c4956a', '#5a8f5a', '#d4a574', '#4e6e52'][name.charCodeAt(0) % 5];
  }
  getProfessionalName(id: number): string { return this.authService.getProfessionalName(id); }
}