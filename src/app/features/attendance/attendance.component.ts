import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { ToastModule } from 'primeng/toast';
import { DialogModule } from 'primeng/dialog';
import { MultiSelectModule } from 'primeng/multiselect';
import { InputNumberModule } from 'primeng/inputnumber';
import { TextareaModule } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import { PatientService } from '../../core/services/patient.service';
import { AuthService } from '../../core/services/auth.service';
import { Patient } from '../../core/models/patient.model';
import {
  Attendance,
  AttendanceFormData,
  AvulsoFormData,
  ATTENDANCE_STATUS_CONFIG,
  PendingMakeup,
} from '../../core/models/attendance.model';
import { forkJoin } from 'rxjs';
import { BiometricService } from '../../core/services/biometric.service';
import { BiometricCheckinComponent } from './biometric-checkin/biometric-checkin';

interface PatientAttendance extends Patient {
  todayStatus?: 'present' | 'absent' | 'makeup' | null;
  todayAttendanceId?: string;
  hasClass: boolean;
  isAvulso?: boolean;
  avulsoValor?: number;
  avulsoNotes?: string;
  /** TRUE quando a presença do dia é resultado de uma reposição (makeup_origin_id preenchido) */
  isReposto?: boolean;
  /** Data da falta original que está sendo reposta — exibida na listagem para controle */
  makeupOriginDate?: Date;
}

@Component({
  selector: 'app-attendance',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterLink,
    CardModule,
    ButtonModule,
    DatePickerModule,
    SelectModule,
    SelectButtonModule,
    ToastModule,
    DialogModule,
    MultiSelectModule,
    InputNumberModule,
    TextareaModule,
    TooltipModule,
    BiometricCheckinComponent,
  ],
  providers: [MessageService],
  templateUrl: './attendance.component.html',
  styleUrls: ['./attendance.component.scss'],
})
export class AttendanceComponent implements OnInit {
  private biometricService = inject(BiometricService);
  private patientService = inject(PatientService);
  private authService = inject(AuthService);
  private messageService = inject(MessageService);

  selectedDate = signal<Date>(new Date());
  selectedProfessional = signal<number | null>(null);
  showMarkedStudents = signal<boolean>(false);
  biometricSupported = signal<boolean | null>(null);

  patients = signal<PatientAttendance[]>([]);
  allPatients = signal<Patient[]>([]);
  filteredPatients = signal<PatientAttendance[]>([]);
  loading = signal(false);
  saving = signal(false);

  // ── Aula Avulsa ──────────────────────────────────────────────
  showAvulsoDialog = signal(false);
  savingAvulso = signal(false);

  // ── Reposição ────────────────────────────────────────────────
  //
  // FLUXO CORRIGIDO — dois passos explícitos no dialog:
  //
  //   Passo 1 (só quando aberto pelo header, sem aluno):
  //     Exibe lista de alunos que têm falta pendente e aguarda seleção.
  //
  //   Passo 2:
  //     Com o aluno definido (via card ou via passo 1), exibe somente as
  //     faltas pendentes daquele aluno para o professor escolher qual repor.
  //
  // Variáveis:
  //   repostoStep          → 'select-student' | 'select-makeup'
  //   repostoPatient       → aluno cujas faltas estão sendo exibidas
  //   selectedMakeupId     → ID do registro makeup escolhido
  //
  showRepostoDialog = signal(false);
  savingReposto = signal(false);
  pendingMakeups = signal<PendingMakeup[]>([]);

  /** Controla em qual passo do dialog estamos */
  repostoStep = signal<'select-student' | 'select-makeup'>('select-makeup');

  /** Aluno cujas faltas estão sendo exibidas no passo 2 */
  repostoPatient = signal<PatientAttendance | null>(null);

  /** ID do makeup selecionado no passo 2 */
  selectedMakeupId = signal<string | null>(null);

  /**
   * Alunos distintos que possuem ao menos 1 reposição pendente no mês.
   * Exibidos no passo 1 quando o dialog é aberto pelo header.
   */
  studentsWithPendingMakeups = computed(() => {
    const map = new Map<string, { id: string; nome: string; qtd: number }>();
    for (const m of this.pendingMakeups()) {
      const key = String(m.patient_id);
      if (map.has(key)) {
        map.get(key)!.qtd++;
      } else {
        map.set(key, { id: key, nome: m.patient_nome, qtd: 1 });
      }
    }
    return Array.from(map.values());
  });

  /**
   * Faltas pendentes filtradas pelo aluno selecionado (passo 2).
   * Nunca mistura faltas de alunos diferentes.
   */
  makeupsPorAluno = computed(() => {
    const patient = this.repostoPatient();
    if (!patient) return [];
    return this.pendingMakeups().filter((m) => String(m.patient_id) === String(patient.id));
  });

  // ─────────────────────────────────────────────────────────────

  professionalsOptions = computed(() => [
    { label: 'Todos', value: null },
    ...this.authService.professionals().map((p) => ({ label: p.nome, value: p.id })),
  ]);

  statusOptions = [
    { label: 'Presente', value: 'present', icon: 'pi pi-check' },
    { label: 'Faltou', value: 'absent', icon: 'pi pi-times' },
    { label: 'Reposição', value: 'makeup', icon: 'pi pi-replay' },
  ];

  viewModeOptions = [
    { label: 'Pendentes', value: false, icon: 'pi pi-clock' },
    { label: 'Todos', value: true, icon: 'pi pi-list' },
  ];

  attendanceConfig = ATTENDANCE_STATUS_CONFIG;

  isGestor = signal(false);
  profissionalNome = signal('');

  private fb = inject(FormBuilder);
  avulsoForm = this.fb.group({
    patient_ids: [[] as string[], Validators.required],
    date: [new Date() as Date, Validators.required],
    valor: [null as number | null, [Validators.required, Validators.min(0.01)]],
    notes: [''],
  });

  avulsoList = computed(() => this.filteredPatients().filter((p) => p.isAvulso === true));

  /** Alunos que vieram repor hoje mas não têm aula cadastrada neste dia da semana */
  repostoExtrasList = computed(() =>
    this.filteredPatients().filter((p) => p.isReposto && !p.hasClass && !p.isAvulso),
  );

  ngOnInit(): void {
    this.biometricService.isSupported().then((s) => this.biometricSupported.set(s));
    const user = this.authService.getCurrentUser();
    const gestor = user?.role === 'gestor';
    this.isGestor.set(gestor);
    if (!gestor && user) this.profissionalNome.set(user.nome);

    this.patientService.loadPatients();
    this.patientService.getPatients().subscribe((patients) => {
      this.allPatients.set(patients);
    });
    this.loadDayAttendance();
  }

  loadDayAttendance(): void {
    this.loading.set(true);
    const dateStr = this.getDateString(this.selectedDate());

    this.patientService.getPatients().subscribe({
      next: (allPatients) => {
        const dayKey = this.getDayKey(this.selectedDate());
        const patientsWithClass = allPatients.filter((p) => {
          if (!p.dias.includes(dayKey)) return false;
          const inicio = new Date(p.data_inicio);
          inicio.setHours(0, 0, 0, 0);
          const hoje = new Date();
          hoje.setHours(0, 0, 0, 0);
          if (inicio > hoje) return false;
          if (p.data_fim) {
            const fim = new Date(p.data_fim);
            fim.setHours(0, 0, 0, 0);
            if (fim < hoje) return false;
          }
          return true;
        });

        this.patientService.getAttendanceByDate(dateStr).subscribe({
          next: (attendanceOfDay) => {
            const regulares = attendanceOfDay.filter((a) => !a.tipo || a.tipo === 'regular');
            const avulsas = attendanceOfDay.filter((a) => a.tipo === 'avulso');

            // Chave sempre como string para garantir match com p.id (que é string no Angular)
            const attendanceMap = new Map<string, Attendance>(
              regulares.map((a) => [String(a.patient_id), a]),
            );

            // IDs de alunos que têm aula cadastrada hoje
            const idsComAulaHoje = new Set(patientsWithClass.map((p) => String(p.id)));

            // ── Alunos com aula cadastrada hoje ──────────────────────────
            const mapped: PatientAttendance[] = patientsWithClass.map((p) => {
              const att = attendanceMap.get(String(p.id));
              const isReposto = att?.status === 'present' && !!att?.makeup_origin_id;
              return {
                ...p,
                hasClass: true,
                todayStatus: att?.status ?? null,
                todayAttendanceId: att?.id,
                isReposto,
              };
            });

            // ── Repostos fora do dia habitual ────────────────────────────
            // Alunos que vieram repor hoje mas NÃO têm aula cadastrada neste dia da semana.
            // O attendance existe no banco (makeup_origin_id preenchido), mas não passa
            // pelo filtro de patientsWithClass — sem esse bloco, somem da listagem.
            const repostoExtras: PatientAttendance[] = regulares
              .filter((a) => a.makeup_origin_id && !idsComAulaHoje.has(String(a.patient_id)))
              .map((att) => {
                const paciente = allPatients.find((p) => String(p.id) === String(att.patient_id));
                if (!paciente) return null;
                return {
                  ...paciente,
                  hasClass: false,
                  isReposto: true,
                  todayStatus: att.status as PatientAttendance['todayStatus'],
                  todayAttendanceId: att.id,
                } as PatientAttendance;
              })
              .filter((x): x is PatientAttendance => x !== null);

            // ── Avulsas ──────────────────────────────────────────────────
            const avulsoItems: PatientAttendance[] = avulsas
              .map((av) => {
                const paciente = allPatients.find((p) => p.id === av.patient_id);
                if (!paciente) return null;
                return {
                  ...paciente,
                  hasClass: false,
                  isAvulso: true,
                  todayStatus: 'present',
                  todayAttendanceId: av.id,
                  avulsoValor: av.valor,
                  avulsoNotes: av.notes,
                } as PatientAttendance;
              })
              .filter((x): x is PatientAttendance => x !== null);

            this.patients.set([...mapped, ...repostoExtras, ...avulsoItems]);
            this.applyFilters();

            this.patientService.getPendingMakeupsList(dateStr).subscribe({
              next: (list) => this.pendingMakeups.set(list),
              error: () => {},
            });

            this.loading.set(false);
          },
          error: () => {
            this.messageService.add({
              severity: 'error',
              summary: 'Erro',
              detail: 'Não foi possível carregar as frequências do dia',
            });
            this.loading.set(false);
          },
        });
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: 'Erro',
          detail: 'Não foi possível carregar os alunos',
        });
        this.loading.set(false);
      },
    });
  }

  onBiometricSuccess(attendance: Attendance, patient: PatientAttendance): void {
    this._updatePatientStatus(patient.id, 'present');
    patient.todayAttendanceId = attendance.id;
    this.messageService.add({
      severity: 'success',
      summary: 'Presença registrada',
      detail: `${patient.nome} — presença via biometria`,
    });
  }

  onBiometricError(message: string): void {
    this.messageService.add({ severity: 'warn', summary: 'Biometria', detail: message });
  }

  applyFilters(): void {
    let filtered = [...this.patients()];
    if (this.selectedProfessional())
      filtered = filtered.filter((p) => p.profissional_id === this.selectedProfessional());
    if (!this.showMarkedStudents())
      // Avulsas e repostos fora do dia habitual sempre aparecem — têm registro explícito no dia
      filtered = filtered.filter((p) => p.isAvulso || p.isReposto || !p.todayStatus);
    this.filteredPatients.set(filtered);
  }

  onDateChange(date: Date): void {
    this.selectedDate.set(date);
    this.loadDayAttendance();
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
    const formData: AttendanceFormData = { date: this.selectedDate(), status, notes: '' };
    this.saving.set(true);
    this._updatePatientStatus(patient.id, status);

    const request$ = patient.todayAttendanceId
      ? this.patientService.updateAttendance(patient.id, patient.todayAttendanceId, formData)
      : this.patientService.addAttendance(patient.id, formData);

    request$.subscribe({
      next: (att) => {
        this._updatePatientStatus(patient.id, status, att.id);
        this.messageService.add({
          severity: 'success',
          summary: 'Sucesso',
          detail: `${patient.nome}: frequência registrada`,
        });
        this.saving.set(false);

        const dateStr = this.getDateString(this.selectedDate());

        if (patient.tipo !== 'fixo') return;

        this.patientService.getPendingMakeupsList(dateStr).subscribe({
          next: (list) => {
            this.pendingMakeups.set(list);
            const pendentesDoAluno = list.filter(
              (m) => String(m.patient_id) === String(patient.id),
            );
            if (pendentesDoAluno.length > 0) {
              const d = this.selectedDate();
              const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
              const diasRest = lastDay - d.getDate();
              const qtd = pendentesDoAluno.length;
              const diasTxt =
                diasRest === 0
                  ? 'hoje é o último dia!'
                  : diasRest === 1
                    ? 'falta apenas 1 dia'
                    : `faltam ${diasRest} dias`;
              this.messageService.add({
                severity: 'warn',
                summary: `⚠️ Reposição pendente — ${patient.nome}`,
                detail: `${patient.nome} tem ${qtd} reposição(ões) pendente(s) neste mês. Prazo: ${diasTxt} para o fim do mês.`,
                life: 8000,
              });
            }
          },
          error: () => {},
        });
      },
      error: () => {
        this._updatePatientStatus(patient.id, null);
        this.messageService.add({
          severity: 'error',
          summary: 'Erro',
          detail: 'Não foi possível registrar a frequência',
        });
        this.saving.set(false);
      },
    });
  }

  // ── Dialog de Reposição ────────────────────────────────────────────────────

  /**
   * Abre o dialog de reposição.
   *
   * - Com `patient`: pula direto para o passo 2 (lista de faltas do aluno).
   * - Sem `patient` (botão do header): começa no passo 1 (selecionar aluno).
   */
  openRepostoDialog(patient: PatientAttendance | null): void {
    this.selectedMakeupId.set(null);

    if (patient) {
      // Passo 2 direto: já sabemos quem é o aluno
      this.repostoPatient.set(patient);
      this.repostoStep.set('select-makeup');
    } else {
      // Passo 1: professor precisa indicar quem está presente
      this.repostoPatient.set(null);
      this.repostoStep.set('select-student');
    }

    this.showRepostoDialog.set(true);
  }

  /**
   * Avança do passo 1 para o passo 2 após o professor selecionar o aluno.
   * Chamado pelo clique em um card de aluno no passo 1.
   */
  selectStudentForReposto(studentId: string): void {
    // Busca primeiro na lista de alunos presentes no dia, depois em allPatients
    const fromDay = this.patients().find((p) => String(p.id) === studentId);
    if (fromDay) {
      this.repostoPatient.set(fromDay);
    } else {
      const fromAll = this.allPatients().find((p) => String(p.id) === studentId);
      if (fromAll) {
        // Converte Patient → PatientAttendance mínimo para manter o tipo
        this.repostoPatient.set({ ...fromAll, hasClass: false });
      }
    }
    this.selectedMakeupId.set(null);
    this.repostoStep.set('select-makeup');
  }

  /** Volta para o passo 1 (só relevante quando aberto pelo header) */
  backToSelectStudent(): void {
    this.repostoPatient.set(null);
    this.selectedMakeupId.set(null);
    this.repostoStep.set('select-student');
  }

  getMakeupDateLabel(makeup: PendingMakeup): string {
    const d = new Date(makeup.date);
    return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
  }

  confirmReposto(): void {
    const makeupId = this.selectedMakeupId();
    const patient = this.repostoPatient();
    if (!makeupId || !patient) return;

    this.savingReposto.set(true);
    const presentDate = this.getDateString(this.selectedDate());
    const existingAtt = patient.todayAttendanceId
      ? parseInt(patient.todayAttendanceId, 10)
      : undefined;

    this.patientService
      .resolveReposto({
        makeupId,
        presentPatientId: patient.id,
        presentDate,
        existingAttendanceId: existingAtt,
      })
      .subscribe({
        next: (result) => {
          // Busca a data da falta original antes de removê-la da lista
          const originMakeup = this.pendingMakeups().find((m) => m.id === makeupId);

          const jaEstaNaLista = this.patients().some((p) => String(p.id) === String(patient.id));

          if (jaEstaNaLista) {
            // Aluno tem aula cadastrada hoje: apenas atualiza o registro existente
            this.patients.update((list) =>
              list.map((p) =>
                String(p.id) === String(patient.id)
                  ? {
                      ...p,
                      todayStatus: 'present' as const,
                      todayAttendanceId: result.presence.id,
                      isReposto: true,
                      makeupOriginDate: originMakeup?.date,
                    }
                  : p,
              ),
            );
          } else {
            // Aluno não tinha aula hoje: insere como reposto extra no topo da lista
            const novoItem: PatientAttendance = {
              ...patient,
              hasClass: false,
              isReposto: true,
              todayStatus: 'present' as const,
              todayAttendanceId: result.presence.id,
              makeupOriginDate: originMakeup?.date,
            };
            this.patients.update((list) => [novoItem, ...list]);
          }

          this.applyFilters();
          this.pendingMakeups.update((list) => list.filter((m) => m.id !== makeupId));

          this.messageService.add({
            severity: 'success',
            summary: 'Reposição registrada!',
            detail: `Presença de ${patient.nome} registrada e reposição quitada com sucesso.`,
            life: 6000,
          });

          this.savingReposto.set(false);
          this.showRepostoDialog.set(false);
        },
        error: (err) => {
          const detail = err?.error?.message || 'Não foi possível registrar a reposição';
          this.messageService.add({ severity: 'error', summary: 'Erro', detail });
          this.savingReposto.set(false);
        },
      });
  }

  // ─────────────────────────────────────────────────────────────────────────

  clearAttendance(patient: PatientAttendance): void {
    if (!patient.todayAttendanceId) return;

    // Guarda estado anterior para rollback em caso de erro
    const prevStatus = patient.todayStatus;
    const prevAttId = patient.todayAttendanceId;
    const wasReposto = patient.isReposto;

    this._updatePatientStatus(patient.id, null);

    // Se era reposição fora do dia habitual, remove da lista completamente
    if (wasReposto && !patient.hasClass) {
      this.patients.update((list) => list.filter((p) => p.id !== patient.id));
    }

    this.patientService.deleteAttendance(patient.id, prevAttId).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'info',
          summary: 'Removido',
          detail: `${patient.nome}: frequência removida`,
        });
        // Se era reposição, o backend reverteu reposto=FALSE no makeup original —
        // ressincroniza a lista de pendências para o botão "Repor" reaparecer.
        if (wasReposto) {
          const dateStr = this.getDateString(this.selectedDate());
          this.patientService.getPendingMakeupsList(dateStr).subscribe({
            next: (list) => this.pendingMakeups.set(list),
            error: () => {},
          });
        }
        this.applyFilters();
      },
      error: () => {
        // Rollback: restaura estado anterior
        this._updatePatientStatus(patient.id, prevStatus ?? null, prevAttId);
        if (wasReposto && !patient.hasClass) {
          // Reinsere na lista se havia sido removido
          this.patients.update((list) => [
            ...list,
            { ...patient, todayStatus: prevStatus, todayAttendanceId: prevAttId },
          ]);
        }
        this.messageService.add({
          severity: 'error',
          summary: 'Erro',
          detail: 'Não foi possível remover a frequência',
        });
      },
    });
  }

  markAllPresent(): void {
    if (!confirm('Deseja marcar todos os alunos como presente?')) return;
    const pending = this.filteredPatients().filter((p) => !p.todayStatus);
    if (!pending.length) {
      this.messageService.add({
        severity: 'info',
        summary: 'Informação',
        detail: 'Todos já têm frequência registrada',
      });
      return;
    }
    this.saving.set(true);
    const formData: AttendanceFormData = {
      date: this.selectedDate(),
      status: 'present',
      notes: '',
    };
    forkJoin(pending.map((p) => this.patientService.addAttendance(p.id, formData))).subscribe({
      next: (results) => {
        results.forEach((att, i) => this._updatePatientStatus(pending[i].id, 'present', att.id));
        this.applyFilters();
        this.messageService.add({
          severity: 'success',
          summary: 'Sucesso',
          detail: `${pending.length} aluno(s) marcado(s) como presente`,
        });
        this.saving.set(false);
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: 'Erro',
          detail: 'Erro ao marcar alguns alunos. Verifique e tente novamente.',
        });
        this.saving.set(false);
      },
    });
  }

  // ── Aula Avulsa ──────────────────────────────────────────────
  openAvulsoDialog(): void {
    this.avulsoForm.reset({
      patient_ids: [],
      date: this.selectedDate(),
      valor: null,
      notes: '',
    });
    this.showAvulsoDialog.set(true);
  }

  saveAvulso(): void {
    if (this.avulsoForm.invalid) {
      this.avulsoForm.markAllAsTouched();
      return;
    }

    const raw = this.avulsoForm.value;
    const payload: AvulsoFormData = {
      patient_ids: raw.patient_ids as string[],
      date: raw.date as Date,
      valor: raw.valor as number,
      notes: raw.notes ?? '',
    };

    this.savingAvulso.set(true);
    this.patientService.createAvulso(payload).subscribe({
      next: (records) => {
        const qtd = records.length;
        this.messageService.add({
          severity: 'success',
          summary: 'Aula avulsa registrada',
          detail: `${qtd} aula${qtd > 1 ? 's' : ''} avulsa${qtd > 1 ? 's' : ''} lançada${qtd > 1 ? 's' : ''} com sucesso`,
        });
        this.showAvulsoDialog.set(false);
        this.savingAvulso.set(false);
        this.loadDayAttendance();
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: 'Erro',
          detail: 'Não foi possível registrar a(s) aula(s) avulsa(s)',
        });
        this.savingAvulso.set(false);
      },
    });
  }

  deleteAvulso(patient: PatientAttendance): void {
    if (!patient.todayAttendanceId) return;
    if (!confirm(`Excluir a aula avulsa de ${patient.nome}?`)) return;

    this.patientService.deleteAttendance(patient.id, patient.todayAttendanceId).subscribe({
      next: () => {
        this.patients.set(
          this.patients().filter((p) => p.todayAttendanceId !== patient.todayAttendanceId),
        );
        this.applyFilters();
        this.messageService.add({
          severity: 'success',
          summary: 'Removida',
          detail: `Aula avulsa de ${patient.nome} excluída`,
        });
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: 'Erro',
          detail: 'Não foi possível excluir a aula avulsa',
        });
      },
    });
  }

  private _updatePatientStatus(
    id: string,
    status: 'present' | 'absent' | 'makeup' | null,
    attendanceId?: string,
  ): void {
    const updated = this.patients().map((p) =>
      p.id === id
        ? {
            ...p,
            todayStatus: status,
            todayAttendanceId: status === null ? undefined : (attendanceId ?? p.todayAttendanceId),
            // Ao alterar manualmente, limpa flag de reposição — só volta via reload
            isReposto: false,
          }
        : p,
    );
    this.patients.set(updated);
    this.applyFilters();
  }

  getStats() {
    const studentsToCount = this.selectedProfessional()
      ? this.patients().filter((p) => p.profissional_id === this.selectedProfessional())
      : this.patients();
    const regulares = studentsToCount.filter((p) => !p.isAvulso);
    const avulsos = studentsToCount.filter((p) => p.isAvulso).length;
    const present = regulares.filter((p) => p.todayStatus === 'present').length;
    const absent = regulares.filter((p) => p.todayStatus === 'absent').length;
    const makeup = regulares.filter((p) => p.todayStatus === 'makeup').length;
    const pending = regulares.filter((p) => !p.todayStatus).length;
    const total = regulares.length + avulsos;
    return { total, present, absent, makeup, pending, avulsos };
  }

  getDiasRestantes(): number {
    const d = this.selectedDate();
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return lastDay - d.getDate();
  }

  getDayKey(date: Date): string {
    return (
      (
        { 1: 'seg', 2: 'ter', 3: 'qua', 4: 'qui', 5: 'sex', 6: 'sab', 0: 'dom' } as Record<
          number,
          string
        >
      )[date.getDay()] || ''
    );
  }

  getDateString(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /** Retorna a quantidade de faltas pendentes para um aluno específico */
  getMakeupCountForPatient(patientId: string): number {
    return this.pendingMakeups().filter((m) => String(m.patient_id) === String(patientId)).length;
  }

  /** Formata a data da falta original para exibição no badge de reposição */
  formatMakeupOriginDate(date: Date | undefined): string {
    if (!date) return '';
    return new Date(date).toLocaleDateString('pt-BR', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
    });
  }

  getInitials(name: string): string {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  }
  getAvatarColor(name: string): string {
    return ['#7a9e7e', '#c4956a', '#5a8f5a', '#d4a574', '#4e6e52'][name.charCodeAt(0) % 5];
  }
  getProfessionalName(id: number): string {
    return this.authService.getProfessionalName(id);
  }

  onCheckinSuccess(attendance: Attendance): void {
    this.loadDayAttendance();
  }
}
