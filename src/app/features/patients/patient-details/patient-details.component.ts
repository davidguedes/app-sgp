import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { TabsModule } from 'primeng/tabs';
import { TagModule } from 'primeng/tag';
import { BadgeModule } from 'primeng/badge';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { RatingModule } from 'primeng/rating';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TimelineModule } from 'primeng/timeline';
import { ChartModule } from 'primeng/chart';
import { TextareaModule } from 'primeng/textarea';
import { MessageService, ConfirmationService } from 'primeng/api';
import { PatientService } from '../../../core/services/patient.service';
import { ExportService } from '../../../core/services/export.service';
import { AuthService } from '../../../core/services/auth.service';
import { PatientDetail } from '../../../core/models/patient.model';
import { Attendance, AttendanceFormData, ATTENDANCE_STATUS_CONFIG } from '../../../core/models/attendance.model';
import { Evolution, EvolutionFormData, EXERCISES_BY_EQUIPMENT, ExercisesByEquipment } from '../../../core/models/evolution.model';

interface ExerciseOption { label: string; value: string; }
interface ExerciseEquipment { key: keyof ExercisesByEquipment; label: string; exercises: ExerciseOption[]; }

@Component({
  selector: 'app-patient-details',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterLink, CardModule, ButtonModule, TabsModule,
    TagModule, BadgeModule, DialogModule, InputTextModule, TextareaModule,
    DatePickerModule, SelectModule, MultiSelectModule, RatingModule,
    ToastModule, ConfirmDialogModule, TimelineModule, ChartModule
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './patient-details.component.html',
  styleUrls: ['./patient-details.component.scss']
})
export class PatientDetailsComponent implements OnInit {
  private authService = inject(AuthService);

  // Tipado como PatientDetail — garante attendance[] e evolutions[] disponíveis
  patient = signal<PatientDetail | null>(null);
  loading = signal(false);

  showAttendanceDialog = signal(false);
  showEvolutionDialog = signal(false);
  editingAttendance = signal<Attendance | null>(null);
  editingEvolution = signal<Evolution | null>(null);

  attendanceForm = signal<AttendanceFormData>({ date: new Date(), status: 'present', notes: '' });

  evolutionForm = signal<EvolutionFormData>({
    notes: '', eva: 0,
    exercises: { reformer: [], cadillac: [], chair: [], barrel: [], solo: [] },
    date: new Date()
  });

  statusOptions = [
    { label: 'Presente',   value: 'present' },
    { label: 'Faltou',     value: 'absent'  },
    { label: 'Reposição',  value: 'makeup'  }
  ];

  exerciseEquipments: ExerciseEquipment[] = [
    { key: 'reformer', label: 'Reformer',  exercises: EXERCISES_BY_EQUIPMENT.reformer.map(ex => ({ label: ex, value: ex })) },
    { key: 'cadillac', label: 'Cadillac',  exercises: EXERCISES_BY_EQUIPMENT.cadillac.map(ex => ({ label: ex, value: ex })) },
    { key: 'chair',    label: 'Chair',     exercises: EXERCISES_BY_EQUIPMENT.chair.map(ex => ({ label: ex, value: ex }))    },
    { key: 'barrel',   label: 'Barrel',    exercises: EXERCISES_BY_EQUIPMENT.barrel.map(ex => ({ label: ex, value: ex }))   },
    { key: 'solo',     label: 'Solo/Mat',  exercises: EXERCISES_BY_EQUIPMENT.solo.map(ex => ({ label: ex, value: ex }))     }
  ];

  attendanceConfig = ATTENDANCE_STATUS_CONFIG;
  attendanceChartData: any;
  attendanceChartOptions: any;
  professionalsMap = this.authService.professionalsMap;

  evaLevels = [
    { value: 0,  image: 'assets/eva/grau-0.svg',  description: 'Sem dor'           },
    { value: 2,  image: 'assets/eva/grau-2.svg',  description: 'Dor leve'          },
    { value: 4,  image: 'assets/eva/grau-4.svg',  description: 'Dor leve a moderada' },
    { value: 6,  image: 'assets/eva/grau-6.svg',  description: 'Dor moderada'      },
    { value: 8,  image: 'assets/eva/grau-8.svg',  description: 'Dor intensa'       },
    { value: 10, image: 'assets/eva/grau-10.svg', description: 'Pior dor possível' }
  ];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private patientService: PatientService,
    private exportService: ExportService,
    private messageService: MessageService,
    private confirmationService: ConfirmationService
  ) {
    this.authService.loadProfessionals();
    this.setupChartOptions();
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) this.loadPatient(id);
  }

  loadPatient(id: string): void {
    this.loading.set(true);
    this.patientService.getPatientById(id).subscribe({
      next: (patient) => {
        this.patient.set(patient);
        this.updateChart();
        this.loading.set(false);
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Erro', detail: 'Aluno não encontrado' });
        this.router.navigate(['/patients']);
        this.loading.set(false);
      }
    });
  }

  // ─────────────────────────────────────────────
  // STATE LOCAL — evita reload total após mutações
  // ─────────────────────────────────────────────

  private patchAttendance(attendance: Attendance[]): void {
    const p = this.patient();
    if (!p) return;
    this.patient.set({ ...p, attendance });
    this.updateChart();
  }

  private patchEvolutions(evolutions: Evolution[]): void {
    const p = this.patient();
    if (!p) return;
    this.patient.set({ ...p, evolutions });
  }

  // ─────────────────────────────────────────────
  // FREQUÊNCIA
  // ─────────────────────────────────────────────

  openAttendanceDialog(): void {
    this.attendanceForm.set({ date: new Date(), status: 'present', notes: '' });
    this.editingAttendance.set(null);
    this.showAttendanceDialog.set(true);
  }

  editAttendance(attendance: Attendance): void {
    this.attendanceForm.set({ date: new Date(attendance.date), status: attendance.status, notes: attendance.notes || '' });
    this.editingAttendance.set(attendance);
    this.showAttendanceDialog.set(true);
  }

  saveAttendance(): void {
    const patient = this.patient();
    if (!patient) return;
    const formData = this.attendanceForm();
    if (!formData.date) {
      this.messageService.add({ severity: 'warn', summary: 'Atenção', detail: 'Selecione uma data' });
      return;
    }

    this.loading.set(true);
    const editing = this.editingAttendance();

    const request$ = editing
      ? this.patientService.updateAttendance(patient.id, editing.id, formData)
      : this.patientService.addAttendance(patient.id, formData);

    request$.subscribe({
      next: (saved) => {
        console.log('O slvo: ', saved);
        const p = this.patient()!;
        const current = p.attendance || [];
        const updated = editing
          ? current.map(a => a.id === editing.id ? saved : a)
          : [saved, ...current];
        this.patchAttendance(updated);
        this.showAttendanceDialog.set(false);
        this.messageService.add({ severity: 'success', summary: 'Sucesso', detail: editing ? 'Frequência atualizada' : 'Frequência registrada' });
        this.loading.set(false);
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Erro', detail: 'Não foi possível salvar' });
        this.loading.set(false);
      }
    });
  }

  deleteAttendance(attendance: Attendance): void {
    const patient = this.patient();
    if (!patient) return;
    this.confirmationService.confirm({
      message: 'Deseja remover este registro de frequência?',
      header: 'Confirmar Exclusão',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Sim, remover',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.patientService.deleteAttendance(patient.id, attendance.id).subscribe({
          next: () => {
            const p = this.patient()!;
            this.patchAttendance(p.attendance.filter(a => a.id !== attendance.id));
          },
          error: () => this.messageService.add({ severity: 'error', summary: 'Erro', detail: 'Não foi possível remover' })
        });
      }
    });
  }

  // ─────────────────────────────────────────────
  // EVOLUÇÕES
  // ─────────────────────────────────────────────

  openEvolutionDialog(): void {
    this.evolutionForm.set({ notes: '', eva: 0, exercises: { reformer: [], cadillac: [], chair: [], barrel: [], solo: [] }, date: new Date() });
    this.editingEvolution.set(null);
    this.showEvolutionDialog.set(true);
  }

  editEvolution(evolution: Evolution): void {
    this.evolutionForm.set({ notes: evolution.notes || '', eva: evolution.eva || 0, exercises: evolution.exercises || { reformer: [], cadillac: [], chair: [], barrel: [], solo: [] }, date: new Date(evolution.date) });
    this.editingEvolution.set(evolution);
    this.showEvolutionDialog.set(true);
  }

  saveEvolution(): void {
    const patient = this.patient();
    if (!patient) return;
    const formData = this.evolutionForm();
    if (!formData.notes?.trim()) {
      this.messageService.add({ severity: 'warn', summary: 'Atenção', detail: 'Preencha as observações da aula' });
      return;
    }

    this.loading.set(true);
    const editing = this.editingEvolution();

    const request$ = editing
      ? this.patientService.updateEvolution(patient.id, editing.id, formData)
      : this.patientService.addEvolution(patient.id, formData);

    request$.subscribe({
      next: (saved) => {
        console.log('O slvo evolution: ', saved);
        const p = this.patient()!;
        const current = p.evolutions || [];
        const updated = editing
          ? current.map(e => e.id === editing.id ? saved : e)
          : [saved, ...current];
        this.patchEvolutions(updated);
        this.showEvolutionDialog.set(false);
        this.messageService.add({ severity: 'success', summary: 'Sucesso', detail: editing ? 'Evolução atualizada' : 'Evolução registrada' });
        this.loading.set(false);
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Erro', detail: 'Não foi possível salvar' });
        this.loading.set(false);
      }
    });
  }

  deleteEvolution(evolution: Evolution): void {
    const patient = this.patient();
    if (!patient) return;
    this.confirmationService.confirm({
      message: 'Deseja remover esta evolução?',
      header: 'Confirmar Exclusão',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Sim, remover',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.patientService.deleteEvolution(patient.id, evolution.id).subscribe({
          next: () => {
            const p = this.patient()!;
            this.patchEvolutions(p.evolutions.filter(e => e.id !== evolution.id));
            this.messageService.add({ severity: 'success', summary: 'Sucesso', detail: 'Evolução removida' });
          },
          error: () => this.messageService.add({ severity: 'error', summary: 'Erro', detail: 'Não foi possível remover' })
        });
      }
    });
  }

  // ─────────────────────────────────────────────
  // ESCALA EVA
  // ─────────────────────────────────────────────

  setEvaLevel(level: number): void { this.evolutionForm.update(f => ({ ...f, eva: level })); }

  getEvaDescription(eva: number): string {
    if (eva === 0) return 'Sem dor';
    if (eva <= 3)  return 'Dor leve';
    if (eva <= 6)  return 'Dor moderada';
    if (eva <= 9)  return 'Dor intensa';
    return 'Pior dor possível';
  }

  getEvaSeverityClass(eva: number): string {
    if (eva === 0) return 'eva-none';
    if (eva <= 3)  return 'eva-mild';
    if (eva <= 6)  return 'eva-moderate';
    if (eva <= 9)  return 'eva-severe';
    return 'eva-extreme';
  }

  getEvaImage(eva: number): string {
    if (eva === 0) return 'assets/eva/grau-0.svg';
    if (eva <= 3)  return 'assets/eva/grau-2.svg';
    if (eva <= 5)  return 'assets/eva/grau-4.svg';
    if (eva <= 7)  return 'assets/eva/grau-6.svg';
    if (eva <= 9)  return 'assets/eva/grau-8.svg';
    return 'assets/eva/grau-10.svg';
  }

  // ─────────────────────────────────────────────
  // UTILS / CHART
  // ─────────────────────────────────────────────

  hasExercises(exercises: ExercisesByEquipment): boolean {
    if (!exercises) return false;
    return Object.values(exercises).some(v => v?.length > 0);
  }

  getAttendanceStats() {
    const attendance = this.patient()?.attendance ?? [];
    const present = attendance.filter(a => a.status === 'present').length;
    const absent  = attendance.filter(a => a.status === 'absent').length;
    const makeup  = attendance.filter(a => a.status === 'makeup').length;
    const total   = present + absent;
    return { present, absent, makeup, total, rate: total > 0 ? (present / total) * 100 : 0 };
  }

  getSeverity(rate: number): 'success' | 'warn' | 'danger' {
    if (rate >= 80) return 'success';
    if (rate >= 60) return 'warn';
    return 'danger';
  }

  getInitials(name: string): string { return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2); }
  getAvatarColor(name: string): string {
    return ['#7a9e7e', '#c4956a', '#5a8f5a', '#d4a574', '#4e6e52'][name.charCodeAt(0) % 5];
  }

  exportPatient(): void {
    const patient = this.patient();
    if (!patient) return;
    this.exportService.exportPatientDetail(patient);
    this.messageService.add({ severity: 'success', summary: 'Sucesso', detail: 'Relatório exportado' });
  }

  setupChartOptions(): void {
    this.attendanceChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { font: { family: 'DM Sans', size: 12 } } } }
    };
  }

  updateChart(): void {
    const s = this.getAttendanceStats();
    this.attendanceChartData = {
      labels: ['Presenças', 'Faltas', 'Reposições'],
      datasets: [{
        data: [s.present, s.absent, s.makeup],
        backgroundColor: ['rgba(90,143,90,0.8)', 'rgba(192,96,96,0.8)', 'rgba(212,165,116,0.8)'],
        borderColor: ['#5a8f5a', '#c06060', '#d4a574'],
        borderWidth: 2
      }]
    };
  }

  getAttendanceStatus(status: Attendance['status']) {
    return this.attendanceConfig[status];
  }
}