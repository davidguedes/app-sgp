import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { BadgeModule } from 'primeng/badge';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';
import { PatientService } from '../../../core/services/patient.service';
import { ExportService } from '../../../core/services/export.service';
import { AuthService } from '../../../core/services/auth.service';
import { Patient } from '../../../core/models/patient.model';
import { RouterLink } from '@angular/router';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';

@Component({
  selector: 'app-patient-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TableModule,
    ButtonModule,
    InputTextModule,
    SelectModule,
    TagModule,
    BadgeModule,
    ToastModule,
    ConfirmDialogModule,
    IconFieldModule,
    InputIconModule,
    RouterLink
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './patient-list.component.html',
  styleUrls: ['./patient-list.component.scss']
})
export class PatientListComponent implements OnInit {
  authService = inject(AuthService);

  patients = signal<Patient[]>([]);
  filteredPatients = signal<Patient[]>([]);
  searchQuery = signal('');
  selectedProfessional = signal<number | null>(null);
  loading = signal(false);
    
  professionalsOptions = computed(() =>
    this.authService.professionals().map(p => ({
      label: p.nome,
      value: p.id
    }))
  );

  constructor(
    private patientService: PatientService,
    private exportService: ExportService,
    private messageService: MessageService,
    private confirmationService: ConfirmationService
  ) {}
  
  ngOnInit(): void {
    this.authService.loadProfessionals();
    this.loadPatients();
  }
  
  loadPatients(): void {
    this.loading.set(true);
    this.patientService.getPatients().subscribe({
      next: (patients) => {
        this.patients.set(patients);
        this.applyFilters();
        this.loading.set(false);
      },
      error: (error) => {
        console.error('Erro ao carregar pacientes:', error);
        this.messageService.add({
          severity: 'error',
          summary: 'Erro',
          detail: 'Não foi possível carregar a lista de alunos'
        });
        this.loading.set(false);
      }
    });
  }
  
  applyFilters(): void {
    let filtered = [...this.patients()];
    
    // Filtro por busca
    if (this.searchQuery()) {
      const query = this.searchQuery().toLowerCase();
      filtered = filtered.filter(p => 
        p.nome.toLowerCase().includes(query)
      );
    }
    
    // Filtro por profissional
    if (this.selectedProfessional()) {
      filtered = filtered.filter(p => 
        p.profissional_id === this.selectedProfessional()
      );
    }
    
    this.filteredPatients.set(filtered);
  }
  
  onSearchChange(value: string): void {
    this.searchQuery.set(value);
    this.applyFilters();
  }
  
  onProfessionalChange(value: number | null): void {
    this.selectedProfessional.set(value);
    this.applyFilters();
  }
  
  getAttendanceStats(patient: Patient): { present: number; absent: number; rate: number } {
    const attendance = patient.attendance || [];
    console.log('Attendance:', attendance);
    const present = attendance.filter(a => a.status === 'present').length;
    const absent = attendance.filter(a => a.status === 'absent').length;
    const total = present + absent;
    const rate = total > 0 ? (present / total) * 100 : 0;
    
    return { present, absent, rate };
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
  
  deletePatient(patient: Patient): void {
    this.confirmationService.confirm({
      message: `Tem certeza que deseja excluir ${patient.nome}? Todos os dados serão perdidos permanentemente.`,
      header: 'Confirmar Exclusão',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Sim, excluir',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.patientService.deletePatient(patient.id).subscribe({
          next: () => {
            this.messageService.add({
              severity: 'success',
              summary: 'Sucesso',
              detail: 'Aluno excluído com sucesso'
            });
            this.loadPatients();
          },
          error: (error) => {
            console.error('Erro ao excluir paciente:', error);
            this.messageService.add({
              severity: 'error',
              summary: 'Erro',
              detail: 'Não foi possível excluir o aluno'
            });
          }
        });
      }
    });
  }
  
  exportToExcel(): void {
    const user = this.authService.getCurrentUser();
    if (!user) return;
    
    const patients = this.filteredPatients();
    if (patients.length === 0) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Atenção',
        detail: 'Nenhum aluno para exportar'
      });
      return;
    }
    
    this.exportService.exportPatientsToExcel(
      patients,
      user.nome,
      user.role
    );
    
    this.messageService.add({
      severity: 'success',
      summary: 'Sucesso',
      detail: 'Relatório exportado com sucesso'
    });
  }

  getProfessionalName(id: number): string {
    return this.authService.getProfessionalName(id);
  }
}
