// src/app/features/patients/patient-form/patient-form-improved.component.ts
import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { CheckboxModule } from 'primeng/checkbox';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { PatientService } from '../../../core/services/patient.service';
import { PatientFormData, DAYS_OF_WEEK } from '../../../core/models/patient.model';
import { DatePicker } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { AuthService } from '../../../core/services/auth.service';

interface DayWithSchedule {
  key: string;
  label: string;
  selected: boolean;
  horario: string;
}

@Component({
  selector: 'app-patient-form',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CardModule,
    ButtonModule,
    InputTextModule,
    InputNumberModule,
    DatePicker,
    SelectModule,
    CheckboxModule,
    ToastModule
  ],
  providers: [MessageService],
  templateUrl: './patient-form.component.html',
  styleUrls: ['./patient-form.component.scss']
})
export class PatientFormComponent implements OnInit {
  authService = inject(AuthService);
  
  isEditMode = signal(false);
  patientId = signal<string | null>(null);
  loading = signal(false);
  
  formData: PatientFormData = {
    nome: '',
    profissional: 0,
    dias: [],
    horarios: {},
    valor: 0,
    porcentagem: 0,
    data_inicio: new Date(),
    data_fim: undefined
  };
  
  // Dias com horários
  daysWithSchedule: DayWithSchedule[] = DAYS_OF_WEEK.map(day => ({
    ...day,
    horario: ''
  }));
  
  // Opções de horários pré-definidos
  horarioOptions = [
    { label: '06:00', value: '06:00' },
    { label: '06:30', value: '06:30' },
    { label: '07:00', value: '07:00' },
    { label: '07:30', value: '07:30' },
    { label: '08:00', value: '08:00' },
    { label: '08:30', value: '08:30' },
    { label: '09:00', value: '09:00' },
    { label: '09:30', value: '09:30' },
    { label: '10:00', value: '10:00' },
    { label: '10:30', value: '10:30' },
    { label: '11:00', value: '11:00' },
    { label: '11:30', value: '11:30' },
    { label: '12:00', value: '12:00' },
    { label: '12:30', value: '12:30' },
    { label: '13:00', value: '13:00' },
    { label: '13:30', value: '13:30' },
    { label: '14:00', value: '14:00' },
    { label: '14:30', value: '14:30' },
    { label: '15:00', value: '15:00' },
    { label: '15:30', value: '15:30' },
    { label: '16:00', value: '16:00' },
    { label: '16:30', value: '16:30' },
    { label: '17:00', value: '17:00' },
    { label: '17:30', value: '17:30' },
    { label: '18:00', value: '18:00' },
    { label: '18:30', value: '18:30' },
    { label: '19:00', value: '19:00' },
    { label: '19:30', value: '19:30' },
    { label: '20:00', value: '20:00' },
    { label: '20:30', value: '20:30' },
    { label: '21:00', value: '21:00' }
  ];
  
  professionals = this.authService.professionalsData();
  
  calculatedValues = signal<{ ganho: number }>({ ganho: 0 });
  
  constructor(
    private patientService: PatientService,
    private messageService: MessageService,
    private router: Router,
    private route: ActivatedRoute
  ) {}
  
  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'new') {
      this.isEditMode.set(true);
      this.patientId.set(id);
      this.loadPatient(id);
    }
    
    this.calculateValues();
  }
  
  loadPatient(id: string): void {
    this.loading.set(true);
    this.patientService.getPatientById(id).subscribe({
      next: (patient) => {
        if (patient) {
          console.log('Paciente carregado:', patient);
          this.formData = {
            nome: patient.nome,
            profissional: patient.profissional_id,
            dias: [...patient.dias],
            horarios: { ...patient.horarios },
            valor: patient.valor,
            porcentagem: patient.porcentagem,
            data_inicio: new Date(patient.data_inicio),
            data_fim: patient.data_fim ? new Date(patient.data_fim) : undefined
          };
          console.log('Paciente new Date(patient.data_inicio):', new Date(patient.data_inicio));
          console.log('Paciente new Date(patient.data_inicio):', patient.data_inicio);
                    
          // Atualizar dias com horários
          this.daysWithSchedule.forEach(day => {
            day.selected = patient.dias.includes(day.key);
            day.horario = patient.horarios?.[day.key] || '';
          });
          
          this.calculateValues();
        }
        this.loading.set(false);
      },
      error: (error) => {
        console.error('Erro ao carregar paciente:', error);
        this.messageService.add({
          severity: 'error',
          summary: 'Erro',
          detail: 'Não foi possível carregar os dados do aluno'
        });
        this.loading.set(false);
      }
    });
  }
  
  onDayToggle(): void {
    this.updateFormDays();
  }
  
  onHorarioChange(day: DayWithSchedule, horario: string): void {
    day.horario = horario;
    this.updateFormDays();
  }
  
  // onHorarioChangeDtepcker(day: DayWithSchedule, date: Date) {
  //   if (!date) return;

  //   const h = date.getHours().toString().padStart(2, '0');
  //   const m = date.getMinutes().toString().padStart(2, '0');

  //   day.horario = `${h}:${m}`;
  // }

  updateFormDays(): void {
    this.formData.dias = this.daysWithSchedule
      .filter(d => d.selected)
      .map(d => d.key);

    this.formData.horarios = {};
    this.daysWithSchedule.forEach(d => {
      if (d.selected && d.horario && this.formData.horarios) {
        this.formData.horarios[d.key] = d.horario;
      }
    });
  }
  
  calculateValues(): void {
    const ganho = (this.formData.valor * 0.85) * (this.formData.porcentagem / 100);
    this.calculatedValues.set({ ganho });
  }

  onValorChange(value: number): void {
    this.formData.valor = value;
    this.calculateValues();
  }

  onPorcentagemChange(value: number): void {
    this.formData.porcentagem = value;
    this.calculateValues();
  }
  
  onSubmit(): void {
    const data: PatientFormData = this.formData;
    
    // Validações
    if (!data.nome.trim()) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Atenção',
        detail: 'Por favor, informe o nome do aluno'
      });
      return;
    }
    
    if (!data.profissional) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Atenção',
        detail: 'Por favor, selecione um profissional'
      });
      return;
    }
    
    if (data.dias.length === 0) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Atenção',
        detail: 'Por favor, selecione pelo menos um dia da semana'
      });
      return;
    }
    
    if (data.valor <= 0) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Atenção',
        detail: 'Por favor, informe um valor válido'
      });
      return;
    }
    
    if (data.porcentagem <= 0 || data.porcentagem > 100) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Atenção',
        detail: 'Por favor, informe uma porcentagem válida (1-100)'
      });
      return;
    }
    
    if (!data.data_inicio) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Atenção',
        detail: 'Por favor, informe a data de início'
      });
      return;
    }
    
    // Validar se data_fim é posterior a data_inicio
    if (data.data_fim && data.data_fim < data.data_inicio) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Atenção',
        detail: 'A data de término deve ser posterior à data de início'
      });
      return;
    }
    
    this.loading.set(true);
    
    const operation = this.isEditMode() && this.patientId()
      ? this.patientService.updatePatient(this.patientId()!, data)
      : this.patientService.createPatient(data);
    
    operation.subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Sucesso',
          detail: this.isEditMode() 
            ? 'Aluno atualizado com sucesso' 
            : 'Aluno cadastrado com sucesso'
        });
        
        setTimeout(() => {
          this.router.navigate(['/patients']);
        }, 1000);
      },
      error: (error) => {
        console.error('Erro ao salvar paciente:', error);
        this.messageService.add({
          severity: 'error',
          summary: 'Erro',
          detail: 'Não foi possível salvar o aluno'
        });
        this.loading.set(false);
      }
    });
  }
  
  cancel(): void {
    this.router.navigate(['/patients']);
  }
}