import { Component, computed, inject, OnInit, Signal, signal } from '@angular/core';
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
import { MessageService, ConfirmationService } from 'primeng/api';
import { PatientService } from '../../../core/services/patient.service';
import { ExportService } from '../../../core/services/export.service';
import { AuthService } from '../../../core/services/auth.service';
import { Patient } from '../../../core/models/patient.model';
import { AttendanceFormData, ATTENDANCE_STATUS_CONFIG, Attendance } from '../../../core/models/attendance.model';
import { EvolutionFormData, EXERCISES_BY_EQUIPMENT, ExercisesByEquipment } from '../../../core/models/evolution.model';
import { TextareaModule } from 'primeng/textarea';
import { Professional } from '../../../core/models/user.model';

interface ExerciseOption {
  label: string;
  value: string;
}

interface ExerciseEquipment {
  key: keyof ExercisesByEquipment;
  label: string;
  exercises: ExerciseOption[];
}

@Component({
  selector: 'app-patient-details',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    CardModule,
    ButtonModule,
    TabsModule,
    TagModule,
    BadgeModule,
    DialogModule,
    InputTextModule,
    TextareaModule,
    DatePickerModule,
    SelectModule,
    MultiSelectModule,
    RatingModule,
    ToastModule,
    ConfirmDialogModule,
    TimelineModule,
    ChartModule
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './patient-details.component.html',
  styleUrls: ['./patient-details.component.scss']
})
export class PatientDetailsComponent implements OnInit {
  private authService = inject(AuthService);
  
  patient = signal<Patient | null>(null);
  loading = signal(false);
  
  // Dialogs
  showAttendanceDialog = signal(false);
  showEvolutionDialog = signal(false);
  editingAttendance = signal<any>(null);
  editingEvolution = signal<any>(null);
  
  // Forms
  attendanceForm = signal<AttendanceFormData>({
    date: new Date(),
    status: 'present',
    notes: ''
  });
  
  evolutionForm = signal<EvolutionFormData>({
    notes: '',
    eva: 0,
    exercises: {
      reformer: [],
      cadillac: [],
      chair: [],
      barrel: [],
      solo: []
    },
    date: new Date()
  });
  
  statusOptions = [
    { label: 'Presente', value: 'present' },
    { label: 'Faltou', value: 'absent' },
    { label: 'Reposição', value: 'makeup' }
  ];
  
  // Opções de exercícios por aparelho
  exerciseEquipments: ExerciseEquipment[] = [
    {
      key: 'reformer',
      label: 'Reformer',
      exercises: EXERCISES_BY_EQUIPMENT.reformer.map(ex => ({ label: ex, value: ex }))
    },
    {
      key: 'cadillac',
      label: 'Cadillac',
      exercises: EXERCISES_BY_EQUIPMENT.cadillac.map(ex => ({ label: ex, value: ex }))
    },
    {
      key: 'chair',
      label: 'Chair',
      exercises: EXERCISES_BY_EQUIPMENT.chair.map(ex => ({ label: ex, value: ex }))
    },
    {
      key: 'barrel',
      label: 'Barrel',
      exercises: EXERCISES_BY_EQUIPMENT.barrel.map(ex => ({ label: ex, value: ex }))
    },
    {
      key: 'solo',
      label: 'Solo/Mat',
      exercises: EXERCISES_BY_EQUIPMENT.solo.map(ex => ({ label: ex, value: ex }))
    }
  ];
  
  attendanceConfig = ATTENDANCE_STATUS_CONFIG;
  
  // Charts
  attendanceChartData: any;
  attendanceChartOptions: any;

  evaLevels = [
    { value: 0, image: 'assets/eva/grau-0.svg', description: 'Sem dor' },
    { value: 2, image: 'assets/eva/grau-2.svg', description: 'Dor leve' },
    { value: 4, image: 'assets/eva/grau-4.svg', description: 'Dor leve a moderada' },
    { value: 6, image: 'assets/eva/grau-6.svg', description: 'Dor moderada' },
    { value: 8, image: 'assets/eva/grau-8.svg', description: 'Dor intensa' },
    { value: 10, image: 'assets/eva/grau-10.svg', description: 'Pior dor possível' }
  ];

  professionalsMap = this.authService.professionalsMap;

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
    if (id) {
      this.loadPatient(id);
    }
  }
  
  loadPatient(id: string): void {
    this.loading.set(true);
    this.patientService.getPatientById(id).subscribe({
      next: (patient) => {
        console.log('O paciente encontrado:', patient);
        this.patient.set(patient);
        this.updateChart(patient);
        this.loading.set(false);
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Erro', detail: 'Aluno não encontrado' });
        this.router.navigate(['/patients']);
        this.loading.set(false);
      }
    });
  }
    
  // ═══════════════════════════════════════════════════════════════════════════
  // FREQUÊNCIA
  // ═══════════════════════════════════════════════════════════════════════════
  
  openAttendanceDialog(): void {
    this.attendanceForm.set({
      date: new Date(),
      status: 'present',
      notes: ''
    });
    this.editingAttendance.set(null);
    this.showAttendanceDialog.set(true);
  }
  
  editAttendance(attendance: any): void {
    this.attendanceForm.set({
      date: new Date(attendance.date),
      status: attendance.status,
      notes: attendance.notes || ''
    });
    this.editingAttendance.set(attendance);
    this.showAttendanceDialog.set(true);
  }
  
  saveAttendance(): void {
    const patient = this.patient();
    if (!patient) return;
    
    const formData = this.attendanceForm();
    
    if (!formData.date) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Atenção',
        detail: 'Por favor, selecione uma data'
      });
      return;
    }
    
    this.loading.set(true);
    
    if (this.editingAttendance()) {
      this.patientService.updateAttendance(
        patient.id,
        this.editingAttendance().id,
        formData
      ).subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: 'Sucesso',
            detail: 'Frequência atualizada'
          });
          this.showAttendanceDialog.set(false);
          this.loadPatient(patient.id);
        },
        error: (error) => {
          console.error('Erro ao atualizar frequência:', error);
          this.messageService.add({
            severity: 'error',
            summary: 'Erro',
            detail: 'Não foi possível atualizar'
          });
          this.loading.set(false);
        }
      });
    } else {
      this.patientService.addAttendance(patient.id, formData).subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: 'Sucesso',
            detail: 'Frequência registrada'
          });
          this.showAttendanceDialog.set(false);
          this.loadPatient(patient.id);
        },
        error: (error) => {
          console.error('Erro ao adicionar frequência:', error);
          this.messageService.add({
            severity: 'error',
            summary: 'Erro',
            detail: 'Não foi possível registrar'
          });
          this.loading.set(false);
        }
      });
    }
  }
  
  deleteAttendance(attendance: any): void {
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
            this.messageService.add({
              severity: 'success',
              summary: 'Sucesso',
              detail: 'Registro removido'
            });
            this.loadPatient(patient.id);
          },
          error: (error) => {
            console.error('Erro ao remover frequência:', error);
            this.messageService.add({
              severity: 'error',
              summary: 'Erro',
              detail: 'Não foi possível remover'
            });
          }
        });
      }
    });
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // EVOLUÇÕES
  // ═══════════════════════════════════════════════════════════════════════════
  
  openEvolutionDialog(): void {
    this.evolutionForm.set({
      notes: '',
      eva: 0,
      exercises: {
        reformer: [],
        cadillac: [],
        chair: [],
        barrel: [],
        solo: []
      },
      date: new Date()
    });
    this.editingEvolution.set(null);
    this.showEvolutionDialog.set(true);
  }
  
  editEvolution(evolution: any): void {
    this.evolutionForm.set({
      notes: evolution.notes || '',
      eva: evolution.eva || 0,
      exercises: evolution.exercises || {
        reformer: [],
        cadillac: [],
        chair: [],
        barrel: [],
        solo: []
      },
      date: new Date(evolution.date)
    });
    this.editingEvolution.set(evolution);
    this.showEvolutionDialog.set(true);
  }
  
  saveEvolution(): void {
    const patient = this.patient();
    if (!patient) return;
    
    const formData = this.evolutionForm();
    
    if (!formData.notes || !formData.notes.trim()) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Atenção',
        detail: 'Por favor, preencha as observações da aula'
      });
      return;
    }
    
    this.loading.set(true);
    
    if (this.editingEvolution()) {
      this.patientService.updateEvolution(
        patient.id,
        this.editingEvolution().id,
        formData
      ).subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: 'Sucesso',
            detail: 'Evolução atualizada'
          });
          this.showEvolutionDialog.set(false);
          this.loadPatient(patient.id);
        },
        error: (error) => {
          console.error('Erro ao atualizar evolução:', error);
          this.messageService.add({
            severity: 'error',
            summary: 'Erro',
            detail: 'Não foi possível atualizar'
          });
          this.loading.set(false);
        }
      });
    } else {
      this.patientService.addEvolution(patient.id, formData).subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: 'Sucesso',
            detail: 'Evolução registrada'
          });
          this.showEvolutionDialog.set(false);
          this.loadPatient(patient.id);
        },
        error: (error) => {
          console.error('Erro ao adicionar evolução:', error);
          this.messageService.add({
            severity: 'error',
            summary: 'Erro',
            detail: 'Não foi possível registrar'
          });
          this.loading.set(false);
        }
      });
    }
  }
  
  deleteEvolution(evolution: any): void {
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
            this.messageService.add({
              severity: 'success',
              summary: 'Sucesso',
              detail: 'Evolução removida'
            });
            this.loadPatient(patient.id);
          },
          error: (error) => {
            console.error('Erro ao remover evolução:', error);
            this.messageService.add({
              severity: 'error',
              summary: 'Erro',
              detail: 'Não foi possível remover'
            });
          }
        });
      }
    });
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // ESCALA EVA (ESCALA VISUAL ANALÓGICA)
  // ═══════════════════════════════════════════════════════════════════════════
  
  setEvaLevel(level: number): void {
    this.evolutionForm.update(form => ({
      ...form,
      eva: level
    }));
  }

  getEvaDescription(eva: number): string {
    if (eva === 0) return 'Sem dor';
    if (eva >= 1 && eva <= 3) return 'Dor leve';
    if (eva >= 4 && eva <= 6) return 'Dor moderada';
    if (eva >= 7 && eva <= 9) return 'Dor intensa';
    if (eva === 10) return 'Pior dor possível';
    return '';
  }

  getEvaSeverityClass(eva: number): string {
    if (eva === 0) return 'eva-none';
    if (eva >= 1 && eva <= 3) return 'eva-mild';
    if (eva >= 4 && eva <= 6) return 'eva-moderate';
    if (eva >= 7 && eva <= 9) return 'eva-severe';
    if (eva === 10) return 'eva-extreme';
    return '';
  }
  
  getEvaImage(eva: number): string {
    if (eva === 0) return 'assets/eva/grau-0.svg';
    if (eva >= 1 && eva <= 3) return 'assets/eva/grau-2.svg';
    if (eva >= 4 && eva <= 5) return 'assets/eva/grau-4.svg';
    if (eva >= 6 && eva <= 7) return 'assets/eva/grau-6.svg';
    if (eva >= 8 && eva <= 9) return 'assets/eva/grau-8.svg';
    if (eva === 10) return 'assets/eva/grau-10.svg';
    return 'assets/eva/no-grau.svg'; // fallback
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILS
  // ═══════════════════════════════════════════════════════════════════════════
  
  hasExercises(exercises: ExercisesByEquipment): boolean {
    if (!exercises) return false;
    
    return !!(
      (exercises.reformer && exercises.reformer.length > 0) ||
      (exercises.cadillac && exercises.cadillac.length > 0) ||
      (exercises.chair && exercises.chair.length > 0) ||
      (exercises.barrel && exercises.barrel.length > 0) ||
      (exercises.solo && exercises.solo.length > 0)
    );
  }
  
  getAttendanceStats() {
    const patient = this.patient();
    if (!patient || !patient.attendance) {
      return { present: 0, absent: 0, makeup: 0, total: 0, rate: 0 };
    }
    
    const present = patient.attendance.filter(a => a.status === 'present').length;
    const absent = patient.attendance.filter(a => a.status === 'absent').length;
    const makeup = patient.attendance.filter(a => a.status === 'makeup').length;
    const total = present + absent;
    const rate = total > 0 ? (present / total) * 100 : 0;
    
    return { present, absent, makeup, total, rate };
  }
  
  getSeverity(rate: number): 'success' | 'warn' | 'danger' {
    if (rate >= 80) return 'success';
    if (rate >= 60) return 'warn';
    return 'danger';
  }
  
  getInitials(name: string): string {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  }
  
  getAvatarColor(name: string): string {
    const colors = ['#7a9e7e', '#c4956a', '#5a8f5a', '#d4a574', '#4e6e52'];
    const index = name.charCodeAt(0) % colors.length;
    return colors[index];
  }
  
  exportPatient(): void {
    const patient = this.patient();
    if (!patient) return;
    
    this.exportService.exportPatientDetail(patient);
    this.messageService.add({
      severity: 'success',
      summary: 'Sucesso',
      detail: 'Relatório exportado'
    });
  }
  
  setupChartOptions(): void {
    this.attendanceChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            font: {
              family: 'DM Sans',
              size: 12
            }
          }
        }
      }
    };
  }
  
  updateChart(patient: Patient): void {
    const stats = this.getAttendanceStats();
    
    this.attendanceChartData = {
      labels: ['Presenças', 'Faltas', 'Reposições'],
      datasets: [{
        data: [stats.present, stats.absent, stats.makeup],
        backgroundColor: [
          'rgba(90, 143, 90, 0.8)',
          'rgba(192, 96, 96, 0.8)',
          'rgba(212, 165, 116, 0.8)'
        ],
        borderColor: [
          '#5a8f5a',
          '#c06060',
          '#d4a574'
        ],
        borderWidth: 2
      }]
    };
  }

  getAttendanceStatus(status: Attendance['status']) {
    return this.attendanceConfig[status];
  }
}