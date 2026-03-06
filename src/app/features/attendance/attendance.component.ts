import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { ToastModule } from 'primeng/toast';
import { DialogModule } from 'primeng/dialog';
import { MultiSelectModule } from 'primeng/multiselect';
import { InputNumberModule } from 'primeng/inputnumber';
import { TextareaModule } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import { PatientService } from '../../core/services/patient.service';
import { AuthService } from '../../core/services/auth.service';
import { Patient } from '../../core/models/patient.model';
import { Attendance, AttendanceFormData, AvulsoFormData, ATTENDANCE_STATUS_CONFIG } from '../../core/models/attendance.model';
import { forkJoin } from 'rxjs';

interface PatientAttendance extends Patient {
  todayStatus?: 'present' | 'absent' | 'makeup' | null;
  todayAttendanceId?: string;
  hasClass: boolean;
  isAvulso?: boolean;       // ← novo
  avulsoValor?: number;     // ← novo
  avulsoNotes?: string;     // ← novo
}

@Component({
  selector: 'app-attendance',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule, RouterLink,
    CardModule, ButtonModule, DatePickerModule, SelectModule,
    SelectButtonModule, ToastModule, DialogModule, MultiSelectModule,
    InputNumberModule, TextareaModule, TooltipModule
  ],
  providers: [MessageService],
  templateUrl: './attendance.component.html',
  styleUrls: ['./attendance.component.scss']
})
export class AttendanceComponent implements OnInit {
  selectedDate = signal<Date>(new Date());
  selectedProfessional = signal<number | null>(null);
  showMarkedStudents = signal<boolean>(false);

  patients = signal<PatientAttendance[]>([]);
  allPatients = signal<Patient[]>([]);           // lista completa para o multiselect do avulso
  filteredPatients = signal<PatientAttendance[]>([]);
  loading = signal(false);
  saving = signal(false);

  // ── Aula Avulsa ──────────────────────────────
  showAvulsoDialog = signal(false);
  savingAvulso = signal(false);
  // ─────────────────────────────────────────────

  professionalsOptions = computed(() => [
    { label: 'Todos', value: null },
    ...this.authService.professionals().map(p => ({ label: p.nome, value: p.id }))
  ]);

  statusOptions = [
    { label: 'Presente',  value: 'present', icon: 'pi pi-check' },
    { label: 'Faltou',    value: 'absent',  icon: 'pi pi-times' },
    { label: 'Reposição', value: 'makeup',  icon: 'pi pi-replay' }
  ];

  viewModeOptions = [
    { label: 'Pendentes', value: false, icon: 'pi pi-clock' },
    { label: 'Todos',     value: true,  icon: 'pi pi-list'  }
  ];

  attendanceConfig = ATTENDANCE_STATUS_CONFIG;

  isGestor = signal(false);
  profissionalNome = signal('');

  private fb = inject(FormBuilder);
  avulsoForm = this.fb.group({
    patient_ids: [[] as string[], Validators.required],
    date:        [new Date() as Date, Validators.required],
    valor:       [null as number | null, [Validators.required, Validators.min(0.01)]],
    notes:       ['']
  });

  avulsoList = computed(() =>
  this.filteredPatients().filter(p => p.isAvulso === true)
);

  constructor(
    private patientService: PatientService,
    private authService: AuthService,
    private messageService: MessageService
  ) {}

  ngOnInit(): void {
    const user = this.authService.getCurrentUser();
    const gestor = user?.role === 'gestor';
    this.isGestor.set(gestor);

    if (!gestor && user) {
      this.profissionalNome.set(user.nome);
    }

    this.patientService.loadPatients();

    // Carrega lista completa uma vez — usada no multiselect do dialog avulso
    this.patientService.getPatients().subscribe(patients => {
      this.allPatients.set(patients);
    });

    this.loadDayAttendance();
  }

  /**
   * Estratégia:
   * 1. Pega a lista leve de pacientes (sem attendance aninhado)
   * 2. Filtra quem tem aula no dia selecionado
   * 3. Faz UM único request para buscar attendance do dia — via endpoint dedicado no backend
   *
   * O endpoint GET /api/attendance?date=YYYY-MM-DD retorna todos os registros daquele dia.
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
            // Separa regulares de avulsas
            const regulares  = attendanceOfDay.filter(a => !a.tipo || a.tipo === 'regular');
            const avulsas    = attendanceOfDay.filter(a => a.tipo === 'avulso');

            const attendanceMap = new Map<string, Attendance>(
              regulares.map(a => [a.patient_id, a])
            );

            // Alunos com aula regular no dia
            const mapped: PatientAttendance[] = patientsWithClass.map(p => {
              const att = attendanceMap.get(p.id);
              return { ...p, hasClass: true, todayStatus: att?.status ?? null, todayAttendanceId: att?.id };
            });

            // Avulsas: busca os dados do paciente na lista completa
            const avulsoItems: PatientAttendance[] = avulsas.map(av => {
              const paciente = allPatients.find(p => p.id === av.patient_id);
              if (!paciente) return null;
              return {
                ...paciente,
                hasClass: false,
                isAvulso: true,
                todayStatus: 'present',   // avulsa sempre é presença
                todayAttendanceId: av.id,
                avulsoValor: av.valor,
                avulsoNotes: av.notes
              } as PatientAttendance;
            }).filter((x): x is PatientAttendance => x !== null);

            this.patients.set([...mapped, ...avulsoItems]);
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
    if (this.selectedProfessional())
      filtered = filtered.filter(p => p.profissional_id === this.selectedProfessional());
    // Avulsas sempre visíveis; o toggle só afeta alunos regulares
    if (!this.showMarkedStudents())
      filtered = filtered.filter(p => p.isAvulso || !p.todayStatus);
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
        this._updatePatientStatus(patient.id, status, att.id);
        this.messageService.add({ severity: 'success', summary: 'Sucesso', detail: `${patient.nome}: frequência registrada` });
        this.saving.set(false);
      },
      error: () => {
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

  // ── Aula Avulsa ──────────────────────────────
  openAvulsoDialog(): void {
    this.avulsoForm.reset({
      patient_ids: [],
      date: this.selectedDate(),   // pré-preenche com a data selecionada na tela
      valor: null,
      notes: ''
    });
    this.showAvulsoDialog.set(true);
  }

  saveAvulso(): void {
    if (this.avulsoForm.invalid) {
      this.avulsoForm.markAllAsTouched();
      return;
    }

    const raw = this.avulsoForm.value;
    const payload: AvulsoFormData = {
      patient_ids: raw.patient_ids as string[],
      date:        raw.date as Date,
      valor:       raw.valor as number,
      notes:       raw.notes ?? ''
    };

    this.savingAvulso.set(true);

    this.patientService.createAvulso(payload).subscribe({
      next: (records) => {
        const qtd = records.length;
        this.messageService.add({
          severity: 'success',
          summary: 'Aula avulsa registrada',
          detail: `${qtd} aula${qtd > 1 ? 's' : ''} avulsa${qtd > 1 ? 's' : ''} lançada${qtd > 1 ? 's' : ''} com sucesso`
        });
        this.showAvulsoDialog.set(false);
        this.savingAvulso.set(false);
        // Recarrega a lista do dia para refletir as avulsas recém-criadas
        this.loadDayAttendance();
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Erro', detail: 'Não foi possível registrar a(s) aula(s) avulsa(s)' });
        this.savingAvulso.set(false);
      }
    });
  }

  // ─────────────────────────────────────────────

  // ── Excluir Aula Avulsa ──────────────────────
  deleteAvulso(patient: PatientAttendance): void {
    if (!patient.todayAttendanceId) return;
    if (!confirm(`Excluir a aula avulsa de ${patient.nome}?`)) return;

    this.patientService.deleteAttendance(patient.id, patient.todayAttendanceId).subscribe({
      next: () => {
        // Remove da lista local sem recarregar do servidor (mais performático)
        this.patients.set(this.patients().filter(p => p.todayAttendanceId !== patient.todayAttendanceId));
        this.applyFilters();
        this.messageService.add({
          severity: 'success',
          summary: 'Removida',
          detail: `Aula avulsa de ${patient.nome} excluída`
        });
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: 'Erro',
          detail: 'Não foi possível excluir a aula avulsa'
        });
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
    const regulares = studentsToCount.filter(p => !p.isAvulso);
    const avulsos   = studentsToCount.filter(p => p.isAvulso).length;
    const present   = regulares.filter(p => p.todayStatus === 'present').length;
    const absent    = regulares.filter(p => p.todayStatus === 'absent').length;
    const makeup    = regulares.filter(p => p.todayStatus === 'makeup').length;
    const pending   = regulares.filter(p => !p.todayStatus).length;
    // total inclui regulares + avulsas para refletir todas as aulas do dia
    const total     = regulares.length + avulsos;
    return { total, present, absent, makeup, pending, avulsos };
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