// src/app/features/financial/financial.component.ts
import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { PatientService } from '../../core/services/patient.service';
import { ExportService } from '../../core/services/export.service';
import { AuthService } from '../../core/services/auth.service';
import { Patient } from '../../core/models/patient.model';
import { SelectModule } from 'primeng/select';

interface FinancialStats {
  totalPatients: number;
  totalPackages: number;
  totalBase: number;
  totalLiquid: number;
}

interface DayStats {
  day: string;
  dayLabel: string;
  patients: number;
  liquid: number;
}

@Component({
  selector: 'app-financial',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CardModule,
    ButtonModule,
    SelectModule
  ],
  templateUrl: './financial.component.html',
  styleUrls: ['./financial.component.scss']
})
export class FinancialComponent implements OnInit {
  patients = signal<Patient[]>([]);
  selectedProfessional = signal<number | null>(null);
  loading = signal(false);

  professionalsOptions = computed(() => [
    { label: 'Todos', value: null },
    ...this.authService.professionals().map(p => ({
      label: p.nome,
      value: p.id
    }))
  ]);
  
  daysOfWeek = [
    { key: 'seg', label: 'Segunda' },
    { key: 'ter', label: 'Terça' },
    { key: 'qua', label: 'Quarta' },
    { key: 'qui', label: 'Quinta' },
    { key: 'sex', label: 'Sexta' },
    { key: 'sab', label: 'Sábado' }
  ];
  
  // Computed values usando signals
  stats = computed<FinancialStats>(() => {
    const patientsList = this.getFilteredPatients();
    
    return {
      totalPatients: patientsList.length,
      totalPackages: patientsList.reduce((sum, p) => sum + p.valor, 0),
      totalBase: patientsList.reduce((sum, p) => sum + p.base, 0),
      totalLiquid: patientsList.reduce((sum, p) => sum + p.ganho, 0)
    };
  });
  
  dayStats = computed<DayStats[]>(() => {
    const patientsList = this.getFilteredPatients();
    
    return this.daysOfWeek.map(day => {
      const patientsOfDay = patientsList.filter(p => p.dias.includes(day.key));
      const liquid = patientsOfDay.reduce((sum, p) => sum + p.ganho, 0);
      
      return {
        day: day.key,
        dayLabel: day.label,
        patients: patientsOfDay.length,
        liquid
      };
    });
  });
  
  sortedPatients = computed<Patient[]>(() => {
    return [...this.getFilteredPatients()].sort((a, b) => 
      a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })
    );
  });
  
  constructor(
    private patientService: PatientService,
    private exportService: ExportService,
    private authService: AuthService
  ) {}
  
  ngOnInit(): void {
    this.loadPatients();
  }
  
  loadPatients(): void {
    this.loading.set(true);
    this.patientService.getPatients().subscribe({
      next: (patients) => {
        this.patients.set(patients);
        this.loading.set(false);
      },
      error: (error) => {
        console.error('Erro ao carregar pacientes:', error);
        this.loading.set(false);
      }
    });
  }
  
  getFilteredPatients(): Patient[] {
    let filtered = this.patients();
    
    if (this.selectedProfessional()) {
      filtered = filtered.filter(p => p.profissional_id === this.selectedProfessional());
    }
    
    return filtered;
  }
  
  onProfessionalChange(value: number | null): void {
    this.selectedProfessional.set(value);
  }
  
  exportToExcel(): void {
    const user = this.authService.getCurrentUser();
    if (!user) return;
    
    const patients = this.getFilteredPatients();
    if (patients.length === 0) {
      alert('Nenhum paciente para exportar');
      return;
    }
    
    this.exportService.exportPatientsToExcel(patients, user.nome, user.role);
  }

  // Constante do imposto (15%)
  readonly TAX_RATE = 0.85;
}