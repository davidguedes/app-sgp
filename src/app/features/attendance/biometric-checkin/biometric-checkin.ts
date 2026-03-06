// Painel de check-in "modo academia" — o professor abre esta tela,
// o aluno passa a digital e o sistema descobre quem é e marca presença.
//
// USO no attendance.component.html:
//   <app-biometric-checkin (onAttendanceMarked)="reloadAttendance()" />

import {
  Component, Output, EventEmitter, signal, inject, OnDestroy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TagModule } from 'primeng/tag';
import { InputNumberModule } from 'primeng/inputnumber';
import { MessageService, ConfirmationService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';

import { BiometricService } from '../../../core/services/biometric.service';
import { PatientService } from '../../../core/services/patient.service';
import { Attendance } from '../../../core/models/attendance.model';
import { AvulsoFormData } from '../../../core/models/attendance.model';

type CheckinState =
  | 'idle'        // aguardando o professor iniciar
  | 'waiting'     // aguardando a digital do aluno (Touch ID aberto)
  | 'no-class'    // aluno autenticado mas sem aula hoje
  | 'success'     // presença marcada
  | 'duplicate'   // presença já existia
  | 'error';      // falha (biometria não cadastrada, erro de rede etc.)

interface CheckinResult {
  patientId?:       string;
  patientNome?:     string;
  message:          string;
  attendance?:      Attendance;
}

@Component({
  selector: 'app-biometric-checkin',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ButtonModule, DialogModule,
    TagModule, ToastModule, ConfirmDialogModule, InputNumberModule
  ],
  providers: [MessageService, ConfirmationService],
  template: `
    <p-toast />
    <p-confirmDialog />

    <!-- Botão que abre o painel -->
    <p-button
      label="Check-in Biométrico"
      icon="pi pi-fingerprint"
      severity="secondary"
      [outlined]="true"
      [disabled]="!supported()"
      [pTooltip]="supported() ? 'Identificar aluno pela digital' : 'Dispositivo não suporta biometria'"
      (onClick)="openPanel()" />

    <!-- Painel de check-in -->
    <p-dialog
      header="Check-in Biométrico"
      [(visible)]="panelVisible"
      [modal]="true"
      [closable]="state() !== 'waiting'"
      [style]="{ width: '420px' }"
      (onHide)="reset()">

      <div class="checkin-panel">

        <!-- IDLE: pronto para iniciar -->
        @if (state() === 'idle') {
          <div class="checkin-state idle">
            <div class="checkin-icon">
              <i class="pi pi-fingerprint"></i>
            </div>
            <p class="checkin-hint">
              Peça ao aluno que posicione o dedo no leitor biométrico do dispositivo.
            </p>
            <p-button
              label="Iniciar leitura"
              icon="pi pi-play"
              styleClass="w-full"
              (onClick)="startCheckin()" />
          </div>
        }

        <!-- WAITING: aguardando Touch ID -->
        @if (state() === 'waiting') {
          <div class="checkin-state waiting">
            <div class="checkin-icon pulse">
              <i class="pi pi-fingerprint"></i>
            </div>
            <p class="checkin-hint">Aguardando a digital do aluno...</p>
            <small class="muted">O sistema de biometria do dispositivo está ativo</small>
          </div>
        }

        <!-- SUCCESS: presença marcada -->
        @if (state() === 'success') {
          <div class="checkin-state success">
            <div class="checkin-icon">
              <i class="pi pi-check-circle"></i>
            </div>
            <h3 class="checkin-name">{{ result()?.patientNome }}</h3>
            <p-tag severity="success" value="Presença registrada" icon="pi pi-check" />
            <p class="checkin-hint muted">{{ result()?.message }}</p>
          </div>
        }

        <!-- DUPLICATE: já registrado hoje -->
        @if (state() === 'duplicate') {
          <div class="checkin-state duplicate">
            <div class="checkin-icon warn">
              <i class="pi pi-exclamation-circle"></i>
            </div>
            <h3 class="checkin-name">{{ result()?.patientNome }}</h3>
            <p-tag severity="warn" value="Já registrado hoje" icon="pi pi-info-circle" />
            <p class="checkin-hint muted">{{ result()?.message }}</p>
          </div>
        }

        <!-- NO-CLASS: aluno sem aula hoje -->
        @if (state() === 'no-class') {
          <div class="checkin-state no-class">
            <div class="checkin-icon warn">
              <i class="pi pi-calendar-times"></i>
            </div>
            <h3 class="checkin-name">{{ result()?.patientNome }}</h3>
            <p-tag severity="warn" value="Sem aula agendada hoje" icon="pi pi-calendar" />
            <p class="checkin-hint">{{ result()?.message }}</p>
            <p class="checkin-hint muted">O que deseja fazer?</p>
            <div class="no-class-actions">
              <div class="avulso-valor-field">
                <label for="avulsoValor">Valor da aula avulsa (R$)</label>
                <p-inputNumber
                  inputId="avulsoValor"
                  [ngModel]="avulsoValor()"
                  (ngModelChange)="avulsoValor.set($event)"
                  mode="currency"
                  currency="BRL"
                  locale="pt-BR"
                  [minFractionDigits]="2"
                  placeholder="0,00"
                  styleClass="w-full" />
              </div>
              <p-button
                label="Lançar como Avulsa"
                icon="pi pi-plus"
                severity="info"
                styleClass="w-full"
                [loading]="saving()"
                [disabled]="avulsoValor() === null"
                (onClick)="confirmAvulso()" />
              <p-button
                label="Ignorar"
                icon="pi pi-times"
                severity="secondary"
                [outlined]="true"
                styleClass="w-full"
                (onClick)="reset()" />
            </div>
          </div>
        }

        <!-- ERROR -->
        @if (state() === 'error') {
          <div class="checkin-state error">
            <div class="checkin-icon danger">
              <i class="pi pi-times-circle"></i>
            </div>
            <p-tag severity="danger" value="Falha no check-in" icon="pi pi-times" />
            <p class="checkin-hint">{{ result()?.message }}</p>
          </div>
        }

      </div>

      <!-- Rodapé: botão "Tentar novamente" ou "Fechar" -->
      <ng-template pTemplate="footer">
        @if (state() !== 'waiting' && state() !== 'no-class') {
          @if (state() === 'error' || state() === 'idle') {
            <p-button label="Fechar" severity="secondary" [text]="true" (onClick)="close()" />
          }
          @if (state() === 'success' || state() === 'duplicate') {
            <p-button label="Novo check-in" icon="pi pi-refresh" (onClick)="reset()" />
            <p-button label="Fechar" severity="secondary" [text]="true" (onClick)="close()" />
          }
        }
      </ng-template>
    </p-dialog>
  `,
  styles: [`
    .checkin-panel { padding: .5rem 0; }

    .checkin-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: .75rem;
      text-align: center;
      padding: .5rem 0 1rem;
    }

    .checkin-icon {
      width: 72px; height: 72px;
      border-radius: 50%;
      background: var(--surface-100);
      display: flex; align-items: center; justify-content: center;
      font-size: 2rem;
      color: var(--primary-color);
    }
    .checkin-icon.warn    { color: var(--yellow-600); background: var(--yellow-50); }
    .checkin-icon.danger  { color: var(--red-600);    background: var(--red-50); }
    .checkin-state.success .checkin-icon { color: var(--green-600); background: var(--green-50); }

    /* Animação de pulso no estado "waiting" */
    .checkin-icon.pulse {
      animation: pulse 1.4s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { transform: scale(1);    opacity: 1; }
      50%       { transform: scale(1.12); opacity: .7; }
    }

    .checkin-name {
      margin: 0;
      font-size: 1.2rem;
      font-weight: 700;
    }
    .checkin-hint {
      margin: 0;
      font-size: .9rem;
      max-width: 320px;
    }
    .checkin-hint.muted { color: var(--text-color-secondary); }

    .no-class-actions {
      display: flex;
      flex-direction: column;
      gap: .5rem;
      width: 100%;
      margin-top: .5rem;
    }
    .avulso-valor-field {
      display: flex;
      flex-direction: column;
      gap: .4rem;
      width: 100%;
    }
    .avulso-valor-field label {
      font-size: .85rem;
      font-weight: 600;
      color: var(--text-color-secondary);
      text-align: left;
    }
  `]
})
export class BiometricCheckinComponent implements OnDestroy {
  @Output() onAttendanceMarked = new EventEmitter<Attendance>();

  private biometricService = inject(BiometricService);
  private patientService   = inject(PatientService);
  private messageService   = inject(MessageService);

  supported    = signal<boolean>(false);
  panelVisible = false;
  state        = signal<CheckinState>('idle');
  result       = signal<CheckinResult | null>(null);
  saving       = signal(false);
  avulsoValor  = signal(null);

  constructor() {
    this.biometricService.isSupported().then(s => this.supported.set(s));
  }

  ngOnDestroy() {}

  openPanel() {
    this.reset();
    this.panelVisible = true;
  }

  close() {
    this.panelVisible = false;
    this.reset();
  }

  reset() {
    this.state.set('idle');
    this.result.set(null);
    this.saving.set(false);
    this.avulsoValor.set(null);
  }

  startCheckin() {
    this.state.set('waiting');
    const today = new Date().toISOString().split('T')[0];

    this.biometricService.checkin(today).subscribe({
      next: (res) => {
        if (res.hasClass) {
          // Presença marcada com sucesso
          this.state.set('success');
          this.result.set({ patientId: res.patient.id, patientNome: res.patient.nome, message: res.message, attendance: res.data });
          this.onAttendanceMarked.emit(res.data);
        } else {
          // Aluno autenticado mas sem aula hoje
          this.state.set('no-class');
          this.result.set({ patientId: res.patient.id, patientNome: res.patient.nome, message: res.message });
        }
      },
      error: (err) => {
        const status  = err?.status;
        const message = err?.error?.message || 'Falha no check-in biométrico';

        if (status === 409) {
          // Presença já registrada — não é um erro real
          this.state.set('duplicate');
          this.result.set({
            patientNome: err?.error?.patient?.nome,
            message
          });
        } else {
          this.state.set('error');
          this.result.set({ message });
        }
      }
    });
  }

  confirmAvulso() {
    const r     = this.result();
    const valor = this.avulsoValor();
    if (!r?.patientId || valor === null) return;

    this.saving.set(true);

    const avulsoData: AvulsoFormData = {
      patient_ids: [r.patientId],
      date:        new Date(),
      valor,
      notes:       'Lançada via check-in biométrico (sem aula regular no dia)',
    };

    this.patientService.createAvulso(avulsoData).subscribe({
      next: (records) => {
        this.saving.set(false);
        this.state.set('success');
        this.result.update(prev => ({
          ...prev!,
          message: `Aula avulsa registrada para ${r.patientNome}.`
        }));
        if (records[0]) this.onAttendanceMarked.emit(records[0]);
      },
      error: () => {
        this.saving.set(false);
        this.messageService.add({ severity: 'error', summary: 'Erro', detail: 'Não foi possível lançar a aula avulsa' });
      }
    });
  }
}