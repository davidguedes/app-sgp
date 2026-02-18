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
import { AttendanceFormData, ATTENDANCE_STATUS_CONFIG } from '../../core/models/attendance.model';
import { forkJoin, map, of, switchMap } from 'rxjs';

interface PatientAttendance extends Patient {
  todayStatus?: 'present' | 'absent' | 'makeup' | null;
  hasClass: boolean;
}

@Component({
  selector: 'app-attendance',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    CardModule,
    ButtonModule,
    DatePickerModule,
    SelectModule,
    SelectButtonModule,
    ToastModule
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
  filteredPatients = signal<PatientAttendance[]>([]);
  loading = signal(false);
  saving = signal(false);
  
  professionalsOptions = computed(() => [
    { label: 'Todos', value: null },
    ...this.authService.professionals().map(p => ({
      label: p.nome,
      value: p.id
    }))
  ]);
  
  statusOptions = [
    { label: 'Presente', value: 'present', icon: 'pi pi-check' },
    { label: 'Faltou', value: 'absent', icon: 'pi pi-times' },
    { label: 'Reposição', value: 'makeup', icon: 'pi pi-replay' }
  ];
  
  // Opções de visualização
  viewModeOptions = [
    { label: 'Pendentes', value: false, icon: 'pi pi-clock' },
    { label: 'Todos', value: true, icon: 'pi pi-list' }
  ];
  
  attendanceConfig = ATTENDANCE_STATUS_CONFIG;
  
  constructor(
    private patientService: PatientService,
    private authService: AuthService,
    private messageService: MessageService
  ) {}
  
  ngOnInit(): void {
    this.loadPatients();
  }
  
  loadPatients(): void {
    this.loading.set(true);
    this.patientService.getPatients().pipe(
      switchMap(patients => {
        if (!patients.length) return of([]);
        return forkJoin(
          patients.map(p =>
            this.patientService.getAttendanceByPatient(p.id).pipe(
              map(attendance => ({ ...p, attendance }))
            )
          )
        );
      })
    ).subscribe({
      next: (patients) => {
        this.updatePatientsWithAttendance(patients);
        this.loading.set(false);
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Erro', detail: 'Não foi possível carregar a lista de alunos' });
        this.loading.set(false);
      }
    });
  }
  
  private updatePatientsWithAttendance(patients: Patient[]): void {
    const patientsWithAttendance = patients.map(p => ({
      ...p,
      todayStatus: this.getTodayStatus(p),
      hasClass: this.hasClassToday(p)
    }));
    
    this.patients.set(patientsWithAttendance);
    this.applyFilters();
  }
  
  hasClassToday(patient: Patient): boolean {
    const selectedDate = this.selectedDate();
    const dayOfWeek = this.getDayKey(selectedDate);
    return patient.dias.includes(dayOfWeek);
  }
  
  getTodayStatus(patient: Patient): 'present' | 'absent' | 'makeup' | null {
    if (!patient.attendance || patient.attendance.length === 0) {
      return null;
    }
    
    const selectedDate = this.selectedDate();
    const dateStr = this.getDateString(selectedDate);
    
    const todayAttendance = patient.attendance.find(att => {
      const attDateStr = this.getDateString(new Date(att.date));
      return attDateStr === dateStr;
    });
    
    return todayAttendance ? todayAttendance.status : null;
  }
  
  getDayKey(date: Date): string {
    const dayIndex = date.getDay();
    const daysMap: { [key: number]: string } = {
      1: 'seg',
      2: 'ter',
      3: 'qua',
      4: 'qui',
      5: 'sex',
      6: 'sab',
      0: 'dom'
    };
    return daysMap[dayIndex] || '';
  }
  
  getDateString(date: Date): string {
    return date.toISOString().split('T')[0];
  }
  
  applyFilters(): void {
    let filtered = [...this.patients()];
    
    // Filtrar apenas alunos que têm aula no dia selecionado
    filtered = filtered.filter(p => p.hasClass);
    
    // Filtrar por profissional
    if (this.selectedProfessional()) {
      filtered = filtered.filter(p => p.profissional_id === this.selectedProfessional());
    }
    
    // Filtrar baseado no modo de visualização
    if (!this.showMarkedStudents()) {
      // Modo "Pendentes": mostrar apenas alunos SEM frequência registrada
      filtered = filtered.filter(p => !p.todayStatus);
    }
    // Modo "Todos": mostrar todos os alunos (com e sem frequência)
    
    this.filteredPatients.set(filtered);
  }
  
  onDateChange(date: Date): void {
    this.selectedDate.set(date);
    this.loadPatients();
  }
  
  onProfessionalChange(value: number | null): void {
    this.selectedProfessional.set(value);
    this.applyFilters();
  }
  
  onViewModeChange(value: boolean): void {
    this.showMarkedStudents.set(value);
    this.applyFilters();
  }
  
  markAttendance(patient: PatientAttendance, status: 'present' | 'absent' | 'makeup'): void {
    const formData: AttendanceFormData = {
      date: this.selectedDate(),
      status,
      notes: ''
    };
    
    this.saving.set(true);
    
    // Verificar se já existe registro para hoje
    const existingAttendance = patient.attendance?.find(att => {
      const attDateStr = this.getDateString(new Date(att.date));
      const selectedDateStr = this.getDateString(this.selectedDate());
      return attDateStr === selectedDateStr;
    });
    
    // Atualização otimista da UI
    const updateUI = (newAttendanceId?: string) => {
      const selectedDateStr = this.getDateString(this.selectedDate());
      const currentPatients = this.patients();
      const updatedPatients = currentPatients.map(p => {
        if (p.id === patient.id) {
          const updatedAttendance = [
            ...(p.attendance || []).filter(a => this.getDateString(new Date(a.date)) !== selectedDateStr),
            { id: newAttendanceId || existingAttendance?.id || '', date: this.selectedDate(), status }
          ];
          return { ...p, todayStatus: status, attendance: updatedAttendance };
        }
        return p;
      });
      this.patients.set(updatedPatients);
      this.applyFilters();
    };
    
    if (existingAttendance) {
      // Atualizar registro existente
      this.patientService.updateAttendance(patient.id, existingAttendance.id, formData).subscribe({
        next: () => {
          updateUI();
          this.messageService.add({
            severity: 'success',
            summary: 'Sucesso',
            detail: `${patient.nome}: frequência atualizada`
          });
          this.saving.set(false);
          // Recarregar em background para garantir sincronização
          this.loadPatients();
        },
        error: (error) => {
          console.error('Erro ao atualizar frequência:', error);
          this.messageService.add({
            severity: 'error',
            summary: 'Erro',
            detail: 'Não foi possível atualizar a frequência'
          });
          this.saving.set(false);
          this.loadPatients(); // Reverter em caso de erro
        }
      });
    } else {
      // Criar novo registro
      this.patientService.addAttendance(patient.id, formData).subscribe({
        next: () => {
          updateUI();
          this.messageService.add({
            severity: 'success',
            summary: 'Sucesso',
            detail: `${patient.nome}: frequência registrada`
          });
          this.saving.set(false);
          // Recarregar em background para garantir sincronização
          this.loadPatients();
        },
        error: (error) => {
          console.error('Erro ao registrar frequência:', error);
          this.messageService.add({
            severity: 'error',
            summary: 'Erro',
            detail: 'Não foi possível registrar a frequência'
          });
          this.saving.set(false);
          this.loadPatients(); // Reverter em caso de erro
        }
      });
    }
  }
  
  markAllPresent(): void {
    if (!confirm('Deseja marcar todos os alunos como presente?')) {
      return;
    }
    
    const studentsToMark = this.filteredPatients().filter(p => !p.todayStatus);
    
    if (studentsToMark.length === 0) {
      this.messageService.add({
        severity: 'info',
        summary: 'Informação',
        detail: 'Todos os alunos já têm frequência registrada'
      });
      return;
    }
    
    this.saving.set(true);
    
    // Processar todos de uma vez e depois recarregar
    const markRequests = studentsToMark.map(student => {
      const formData: AttendanceFormData = {
        date: this.selectedDate(),
        status: 'present',
        notes: ''
      };
      return this.patientService.addAttendance(student.id, formData);
    });
    
    // Usar forkJoin para aguardar todas as requisições
    forkJoin(markRequests).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Sucesso',
          detail: `${studentsToMark.length} aluno(s) marcado(s) como presente`
        });
        this.loadPatients();
        this.saving.set(false);
      },
      error: (error) => {
        console.error('Erro ao marcar frequências:', error);
        this.messageService.add({
          severity: 'error',
          summary: 'Erro',
          detail: 'Erro ao marcar alguns alunos. Verifique e tente novamente.'
        });
        this.loadPatients();
        this.saving.set(false);
      }
    });
  }
  
  clearAttendance(patient: PatientAttendance): void {
    const existingAttendance = patient.attendance?.find(att => {
      const attDateStr = this.getDateString(new Date(att.date));
      const selectedDateStr = this.getDateString(this.selectedDate());
      return attDateStr === selectedDateStr;
    });
    
    if (!existingAttendance) return;
    
    // Atualização otimista da UI
    const updateUI = () => {
      const currentPatients = this.patients();
      const updatedPatients = currentPatients.map(p => {
        if (p.id === patient.id) {
          return { ...p, todayStatus: null };
        }
        return p;
      });
      this.patients.set(updatedPatients);
      this.applyFilters();
    };
    
    this.patientService.deleteAttendance(patient.id, existingAttendance.id).subscribe({
      next: () => {
        updateUI();
        this.messageService.add({
          severity: 'info',
          summary: 'Removido',
          detail: `${patient.nome}: frequência removida`
        });
        // Recarregar em background para garantir sincronização
        this.loadPatients();
      },
      error: (error) => {
        console.error('Erro ao remover frequência:', error);
        this.messageService.add({
          severity: 'error',
          summary: 'Erro',
          detail: 'Não foi possível remover a frequência'
        });
        this.loadPatients(); // Reverter em caso de erro
      }
    });
  }
  
  getStats() {
    // Estatísticas de TODOS os alunos do dia (independente do filtro)
    const allDayStudents = this.patients().filter(p => p.hasClass);
    
    // Se tiver filtro de profissional aplicado, considerar apenas esses
    const studentsToCount = this.selectedProfessional() 
      ? allDayStudents.filter(p => p.profissional_id === this.selectedProfessional())
      : allDayStudents;
    
    const total = studentsToCount.length;
    const present = studentsToCount.filter(p => p.todayStatus === 'present').length;
    const absent = studentsToCount.filter(p => p.todayStatus === 'absent').length;
    const makeup = studentsToCount.filter(p => p.todayStatus === 'makeup').length;
    const pending = studentsToCount.filter(p => !p.todayStatus).length;
    
    return { total, present, absent, makeup, pending };
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
  
  getProfessionalName(id: number): string {
    return this.authService.getProfessionalName(id);
  }
}