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

interface FinancialStats { totalPatients: number; totalPackages: number; totalBase: number; totalLiquid: number; }
interface DayStats { day: string; dayLabel: string; patients: number; liquid: number; }

@Component({
  selector: 'app-financial',
  standalone: true,
  imports: [CommonModule, FormsModule, CardModule, ButtonModule, SelectModule],
  templateUrl: './financial.component.html',
  styleUrls: ['./financial.component.scss']
})
export class FinancialComponent implements OnInit {
  patients = signal<Patient[]>([]);
  selectedProfessional = signal<number | null>(null);
  loading = signal(false);

  professionalsOptions = computed(() => [
    { label: 'Todos', value: null },
    ...this.authService.professionals().map(p => ({ label: p.nome, value: p.id }))
  ]);

  daysOfWeek = [
    { key: 'seg', label: 'Segunda' }, { key: 'ter', label: 'Terça' },
    { key: 'qua', label: 'Quarta' },  { key: 'qui', label: 'Quinta' },
    { key: 'sex', label: 'Sexta' },   { key: 'sab', label: 'Sábado' }
  ];

  stats = computed<FinancialStats>(() => {
    const p = this.getFilteredPatients();
    return {
      totalPatients:  p.length,
      totalPackages:  p.reduce((s, x) => s + x.valor, 0),
      totalBase:      p.reduce((s, x) => s + x.base, 0),
      totalLiquid:    p.reduce((s, x) => s + x.ganho, 0)
    };
  });

  dayStats = computed<DayStats[]>(() =>
    this.daysOfWeek.map(day => {
      const dayPatients = this.getFilteredPatients().filter(p => p.dias.includes(day.key));
      return { day: day.key, dayLabel: day.label, patients: dayPatients.length, liquid: dayPatients.reduce((s, p) => s + p.ganho, 0) };
    })
  );

  sortedPatients = computed<Patient[]>(() =>
    [...this.getFilteredPatients()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }))
  );

  readonly TAX_RATE = 0.85;

  constructor(
    private patientService: PatientService,
    private exportService: ExportService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.loading.set(true);
    this.patientService.loadPatients();
    this.patientService.getPatients().subscribe({
      next: (patients) => { this.patients.set(patients); this.loading.set(false); },
      error: () => { console.error('Erro ao carregar pacientes'); this.loading.set(false); }
    });
  }

  getFilteredPatients(): Patient[] {
    let filtered = this.patients();
    if (this.selectedProfessional()) filtered = filtered.filter(p => p.profissional_id === this.selectedProfessional());
    return filtered;
  }

  onProfessionalChange(value: number | null): void { this.selectedProfessional.set(value); }

  exportToExcel(): void {
    const user = this.authService.getCurrentUser();
    if (!user) return;
    const patients = this.getFilteredPatients();
    if (!patients.length) { alert('Nenhum paciente para exportar'); return; }
    this.exportService.exportPatientsToExcel(patients, user.nome, user.role);
  }
}