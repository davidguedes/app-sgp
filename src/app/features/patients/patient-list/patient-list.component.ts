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
    CommonModule, FormsModule, TableModule, ButtonModule, InputTextModule,
    SelectModule, TagModule, BadgeModule, ToastModule, ConfirmDialogModule,
    IconFieldModule, InputIconModule, RouterLink
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
    this.authService.professionals().map(p => ({ label: p.nome, value: p.id }))
  );

  isGestor = signal(false);
  profissionalNome = signal('');

  constructor(
    private patientService: PatientService,
    private exportService: ExportService,
    private messageService: MessageService,
    private confirmationService: ConfirmationService
  ) {}

  ngOnInit(): void {
    const user = this.authService.getCurrentUser();
    const gestor = user?.role === 'gestor';
    this.isGestor.set(gestor);

    if (!gestor && user) {
      // Profissional: já é o responsável — preenche e trava o campo
      //this.formData.profissional = Number(user.id);
      this.profissionalNome.set(user.nome);
    }

    this.loading.set(true);
    // Garante que os dados estão carregados antes de subscrever
    this.patientService.loadPatients();
    this.patientService.getPatients().subscribe({
      next: (patients) => {
        this.patients.set(patients);
        this.applyFilters();
        this.loading.set(false);
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Erro', detail: 'Não foi possível carregar a lista de alunos' });
        this.loading.set(false);
      }
    });
  }

  applyFilters(): void {
    let filtered = [...this.patients()];
    if (this.searchQuery()) {
      const q = this.searchQuery().toLowerCase();
      filtered = filtered.filter(p => p.nome.toLowerCase().includes(q));
    }
    if (this.selectedProfessional()) {
      filtered = filtered.filter(p => p.profissional_id === this.selectedProfessional());
    }
    this.filteredPatients.set(filtered);
  }

  onSearchChange(value: string): void { this.searchQuery.set(value); this.applyFilters(); }
  onProfessionalChange(value: number | null): void { this.selectedProfessional.set(value); this.applyFilters(); }

  // attendance já não existe no Patient leve — usa total_attendance para exibir badge
  getAttendanceRate(patient: Patient): number {
    // taxa não está disponível na listagem leve; redirecione para o detalhe
    return 0;
  }

  getSeverity(rate: number): 'success' | 'warn' | 'danger' {
    if (rate >= 80) return 'success';
    if (rate >= 60) return 'warn';
    return 'danger';
  }

  getInitials(name: string): string {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
  }

  getAvatarColor(name: string): string {
    const colors = ['#7a9e7e', '#c4956a', '#5a8f5a', '#d4a574', '#4e6e52'];
    return colors[name.charCodeAt(0) % colors.length];
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
            // state já atualizado localmente no service
            this.patients.set(this.patientService.patientsSignal());
            this.applyFilters();
            this.messageService.add({ severity: 'success', summary: 'Sucesso', detail: 'Aluno excluído com sucesso' });
          },
          error: () => {
            this.messageService.add({ severity: 'error', summary: 'Erro', detail: 'Não foi possível excluir o aluno' });
          }
        });
      }
    });
  }

  exportToExcel(): void {
    const user = this.authService.getCurrentUser();
    if (!user) return;
    const patients = this.filteredPatients();
    if (!patients.length) {
      this.messageService.add({ severity: 'warn', summary: 'Atenção', detail: 'Nenhum aluno para exportar' });
      return;
    }
    this.exportService.exportPatientsToExcel(patients, user.nome, user.role);
    this.messageService.add({ severity: 'success', summary: 'Sucesso', detail: 'Relatório exportado com sucesso' });
  }

  getProfessionalName(id: number): string { return this.authService.getProfessionalName(id); }
}