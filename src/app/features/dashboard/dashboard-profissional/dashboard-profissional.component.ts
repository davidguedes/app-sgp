import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { BadgeModule } from 'primeng/badge';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { PatientService } from '../../../core/services/patient.service';
import { AuthService } from '../../../core/services/auth.service';
import { Patient } from '../../../core/models/patient.model';
import { Attendance } from '../../../core/models/attendance.model';
import { ATTENDANCE_STATUS_CONFIG } from '../../../core/models/attendance.model';

interface AulaHoje {
  patient: Patient;
  horario: string;
  status: 'present' | 'absent' | 'makeup' | null;
  attendanceId: string | null;
  saving: boolean;
}

@Component({
  selector: 'app-dashboard-profissional',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    CardModule,
    ButtonModule,
    TagModule,
    BadgeModule,
    ToastModule
  ],
  providers: [MessageService],
  templateUrl: './dashboard-profissional.component.html',
  styleUrls: ['./dashboard-profissional.component.scss']
})
export class DashboardProfissionalComponent implements OnInit {

  loading = signal(true);
  savingId = signal<string | null>(null);

  userName = signal('');
  hoje = new Date();

  aulaHoje = signal<AulaHoje[]>([]);
  totalAlunos = signal(0);
  ganhoMes = signal(0);

  attendanceConfig = ATTENDANCE_STATUS_CONFIG;

  readonly diasSemana: Record<number, string> = {
    1: 'seg', 2: 'ter', 3: 'qua', 4: 'qui', 5: 'sex', 6: 'sab', 0: 'dom'
  };

  readonly nomeDia: Record<string, string> = {
    seg: 'Segunda-feira', ter: 'Terça-feira', qua: 'Quarta-feira',
    qui: 'Quinta-feira', sex: 'Sexta-feira', sab: 'Sábado', dom: 'Domingo'
  };

  diaKey = computed(() => this.diasSemana[this.hoje.getDay()] ?? '');

  pendentes = computed(() => this.aulaHoje().filter(a => !a.status).length);
  presentes = computed(() => this.aulaHoje().filter(a => a.status === 'present').length);
  faltas    = computed(() => this.aulaHoje().filter(a => a.status === 'absent').length);

  saudacao = computed(() => {
    const h = this.hoje.getHours();
    if (h < 12) return 'Bom dia';
    if (h < 18) return 'Boa tarde';
    return 'Boa noite';
  });

  constructor(
    private patientService: PatientService,
    private authService: AuthService,
    private messageService: MessageService
  ) {}

  ngOnInit(): void {
    const user = this.authService.getCurrentUser();
    if (user) this.userName.set(user.nome.split(' ')[0]);

    this.patientService.loadPatients();
    this.patientService.getPatients().subscribe({
      next: (patients) => {
        const meus = patients.filter(p => {
          if (p.profissional_id !== Number(user?.id)) return false;
          const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
          const inicio = new Date(p.data_inicio); inicio.setHours(0, 0, 0, 0);
          if (inicio > hoje) return false;
          if (p.data_fim) {
            const fim = new Date(p.data_fim); fim.setHours(0, 0, 0, 0);
            if (fim < hoje) return false;
          }
          return true;
        });

        this.totalAlunos.set(meus.length);
        this.ganhoMes.set(meus.reduce((s, p) => s + p.ganho, 0));

        // Aulas de hoje
        const dayKey = this.diaKey();
        const aulasDeHoje = meus
          .filter(p => p.dias.includes(dayKey))
          .map(p => ({
            patient: p,
            horario: p.horarios?.[dayKey] || '',
            status: null as AulaHoje['status'],
            attendanceId: null,
            saving: false
          }))
          .sort((a, b) => (a.horario || '23:59').localeCompare(b.horario || '23:59'));

        this.aulaHoje.set(aulasDeHoje);

        // Carrega frequências de hoje
        this.carregarFrequenciasDeHoje(aulasDeHoje);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  private carregarFrequenciasDeHoje(aulas: AulaHoje[]): void {
    const dateStr = this.hoje.toISOString().split('T')[0];

    this.patientService.getAttendanceByDate(dateStr).subscribe({
      next: (attendances: Attendance[]) => {
        this.aulaHoje.update(list =>
          list.map(a => {
            const found = attendances.find(att => att.patient_id === a.patient.id);
            return found
              ? { ...a, status: found.status as AulaHoje['status'], attendanceId: found.id }
              : a;
          })
        );
      },
      error: () => {} // silencioso — frequências virão vazias
    });
  }

  marcarFrequencia(aula: AulaHoje, status: 'present' | 'absent' | 'makeup'): void {
    // Toggle: clicar no status ativo não faz nada
    if (aula.status === status) return;

    this.savingId.set(aula.patient.id);

    const dateStr = this.hoje.toISOString().split('T')[0];
    const formData = { date: new Date(dateStr), status, notes: '' };

    const op$ = aula.attendanceId
      ? this.patientService.updateAttendance(aula.patient.id, aula.attendanceId, formData)
      : this.patientService.addAttendance(aula.patient.id, formData);

    op$.subscribe({
      next: (saved: Attendance) => {
        this.aulaHoje.update(list =>
          list.map(a =>
            a.patient.id === aula.patient.id
              ? { ...a, status: saved.status as AulaHoje['status'], attendanceId: saved.id, saving: false }
              : a
          )
        );
        this.savingId.set(null);
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Erro', detail: 'Não foi possível registrar' });
        this.savingId.set(null);
      }
    });
  }

  getInitials(name: string): string {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
  }

  getAvatarColor(name: string): string {
    return ['#7a9e7e', '#c4956a', '#5a8f5a', '#d4a574', '#4e6e52'][name.charCodeAt(0) % 5];
  }

  get dataHoje(): string {
    return this.hoje.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  }
}