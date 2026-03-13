// src/app/features/dashboard/dashboard-profissional/dashboard-profissional.component.ts
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
import { Attendance, ATTENDANCE_STATUS_CONFIG } from '../../../core/models/attendance.model';

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
  imports: [CommonModule, RouterLink, CardModule, ButtonModule, TagModule, BadgeModule, ToastModule],
  providers: [MessageService],
  templateUrl: './dashboard-profissional.component.html',
  styleUrls: ['./dashboard-profissional.component.scss']
})
export class DashboardProfissionalComponent implements OnInit {
  loading    = signal(true);
  savingId   = signal<string | null>(null);
  userName   = signal('');
  hoje       = new Date();
  aulaHoje   = signal<AulaHoje[]>([]);
  totalAlunos = signal(0);
  ganhoMes   = signal(0);
  periodoLabel = '';  // ex: "março de 2025" — exibido junto ao ganho estimado

  attendanceConfig = ATTENDANCE_STATUS_CONFIG;

  readonly diasSemana: Record<number, string> = {
    1: 'seg', 2: 'ter', 3: 'qua', 4: 'qui', 5: 'sex', 6: 'sab', 0: 'dom'
  };

  readonly nomeDia: Record<string, string> = {
    seg: 'Segunda-feira', ter: 'Terça-feira', qua: 'Quarta-feira',
    qui: 'Quinta-feira', sex: 'Sexta-feira', sab: 'Sábado', dom: 'Domingo'
  };

  diaKey    = computed(() => this.diasSemana[this.hoje.getDay()] ?? '');
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

    // ─────────────────────────────────────────────────────────────────────
    // MUDANÇA: usa /patients/financial para o mês atual em vez de /patients.
    //
    // Motivo: o campo ganho_mes no dashboard do profissional mostrava
    // ganho_convenio calculado sobre o histórico todo (findAll), não o mês.
    // Com /financial, aulas_realizadas e ganho_liquido_periodo refletem
    // exatamente o mês corrente.
    //
    // O backend já filtra por profissional_id quando o token é de 'profissional'.
    // ─────────────────────────────────────────────────────────────────────
    const { start, end } = PatientService.monthRange(this.hoje);

    // Label do mês para exibir no template junto ao ganho estimado
    this.periodoLabel = this.hoje.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

    this.patientService.getPatientsByPeriod(start, end).subscribe({
      next: (patients) => {
        // Backend já retorna só os ativos no período — sem necessidade de isActive() no front
        const meusAtivos = patients.filter(p =>
          p.profissional_id === Number(user?.id)
        );
        
        // KPIs financeiros e contagem de alunos: exclui experimentais (sem receita)
        const meusPagantes = meusAtivos.filter(p => p.tipo !== 'experimental');
        
        this.totalAlunos.set(meusPagantes.length);
        this.ganhoMes.set(meusPagantes.reduce((s, p) => s + p.ganho_liquido_periodo, 0));
        
        // Aulas de hoje: inclui experimentais (precisam de registro de presença)
        const dayKey      = this.diaKey();
        const aulasDeHoje = meusAtivos
          .filter(p => p.dias.includes(dayKey))
          .map(p => ({
            patient:      p,
            horario:      p.horarios?.[dayKey] || '',
            status:       null as AulaHoje['status'],
            attendanceId: null,
            saving:       false
          }))
          .sort((a, b) => (a.horario || '23:59').localeCompare(b.horario || '23:59'));
        
        this.aulaHoje.set(aulasDeHoje);
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
      error: () => {}
    });
  }

  marcarFrequencia(aula: AulaHoje, status: 'present' | 'absent' | 'makeup'): void {
    if (aula.status === status) return;

    this.savingId.set(aula.patient.id);
    const dateStr  = this.hoje.toISOString().split('T')[0];
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
    return ['#7a9e7e','#c4956a','#5a8f5a','#d4a574','#4e6e52'][name.charCodeAt(0) % 5];
  }

  get dataHoje(): string {
    return this.hoje.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  }
}