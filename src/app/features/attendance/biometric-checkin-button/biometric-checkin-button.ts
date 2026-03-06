// Botão de check-in biométrico para uso na lista de presença.
// Encapsula toda a lógica: verificar suporte, verificar se o aluno tem
// biometria cadastrada, acionar a autenticação e emitir o resultado.
//
// Uso no attendance.component.html (ao lado dos botões presente/falta):
//
//   <app-biometric-checkin-button
//     [patientId]="patient.id"
//     [hasBiometric]="patient.has_biometric"
//     (onSuccess)="onBiometricSuccess($event, patient)" />

import { Component, Input, Output, EventEmitter, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';

import { BiometricService } from '../../../core/services/biometric.service';
import { Attendance } from '../../../core/models/attendance.model';

@Component({
  selector: 'app-biometric-checkin-button',
  standalone: true,
  imports: [CommonModule, ButtonModule, TooltipModule],
  template: `
    @if (visible()) {
      <button
        class="freq-btn biometric"
        [class.loading]="loading()"
        [disabled]="loading() || disabled"
        [title]="tooltip()"
        (click)="checkin()">
        @if (loading()) {
          <i class="pi pi-spin pi-spinner"></i>
        } @else {
          <i class="fas fa-fingerprint"></i>
        }
      </button>
    }
  `,
  styles: [`
    /* Herda a aparência dos botões freq-btn do attendance.component.scss */
    .freq-btn.biometric {
      background: transparent;
      border: 1.5px solid #7c9cb0;
      color: #7c9cb0;
      border-radius: 8px;
      width: 36px;
      height: 36px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all .2s;
      font-size: .9rem;
    }
    .freq-btn.biometric:hover:not(:disabled) {
      background: #7c9cb0;
      color: white;
    }
    .freq-btn.biometric:disabled {
      opacity: .5;
      cursor: not-allowed;
    }
    .freq-btn.biometric.loading {
      border-color: #7c9cb0;
      color: #7c9cb0;
    }
  `]
})
export class BiometricCheckinButtonComponent {
  @Input({ required: true }) patientId!: string;

  /** Indica se o aluno já tem biometria cadastrada (vem do backend no campo has_biometric) */
  @Input() hasBiometric = false;

  @Input() disabled = false;

  /** Emite o Attendance criado após presença registrada com sucesso */
  @Output() onSuccess = new EventEmitter<Attendance>();

  /** Emite uma mensagem de erro para o componente pai tratar */
  @Output() onError = new EventEmitter<string>();

  private biometricService = inject(BiometricService);

  loading = signal(false);
  visible = signal(false);

  // Verifica suporte ao montar o componente
  // ngOnInit não é necessário — usamos um getter reativo

  constructor() {
    // Verifica suporte no browser. O botão só aparece se o dispositivo
    // tiver autenticador biométrico disponível.
    this.biometricService.isSupported().then(supported => {
      // Só exibe o botão se: browser suporta WebAuthn E aluno tem biometria cadastrada
      this.visible.set(supported && this.hasBiometric);
    });
  }

  tooltip(): string {
    if (!this.hasBiometric) return 'Aluno sem biometria cadastrada';
    return 'Marcar presença via biometria';
  }

  checkin() {
    if (this.loading()) return;
    this.loading.set(true);

    const today = new Date().toISOString().split('T')[0];

    this.biometricService.authenticateAndMarkAttendance(this.patientId, today).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.onSuccess.emit(res.data);
      },
      error: (err) => {
        this.loading.set(false);
        const msg = err?.error?.message || 'Falha na autenticação biométrica';
        this.onError.emit(msg);
      }
    });
  }
}