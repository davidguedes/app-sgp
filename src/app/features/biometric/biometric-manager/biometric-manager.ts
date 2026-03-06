// Componente de gerenciamento biométrico para uso na tela de detalhes do aluno.
// Exibe:
//   - Lista de dispositivos cadastrados (com botão de remoção)
//   - Botão para cadastrar novo dispositivo
//   - Botão para testar autenticação
//
// Uso no patient-details.component.html:
//   <app-biometric-manager [patientId]="patient().id" />

import { Component, Input, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { ToastModule } from 'primeng/toast';
import { TagModule } from 'primeng/tag';
import { MessageService, ConfirmationService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';

import { BiometricService } from '../../../core/services/biometric.service';
import { BiometricCredential } from '../../../core/models/biometric.model';

@Component({
  selector: 'app-biometric-manager',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ButtonModule, DialogModule,
    InputTextModule, ToastModule, TagModule, ConfirmDialogModule
  ],
  providers: [MessageService, ConfirmationService],
  template: `
    <p-toast />
    <p-confirmDialog />

    <div class="biometric-manager">

      <!-- Header com status de suporte -->
      <div class="bm-header">
        <h3 class="bm-title">
          <i class="pi pi-fingerprint"></i>
          Autenticação Biométrica
        </h3>

        @if (supported() === false) {
          <p-tag severity="danger" value="Não suportado neste dispositivo" icon="pi pi-times" />
        } @else if (supported() === true) {
          <p-tag severity="success" value="Disponível neste dispositivo" icon="pi pi-check" />
        }
      </div>

      <!-- Estado de carregamento -->
      @if (loading()) {
        <div class="bm-loading">
          <i class="pi pi-spin pi-spinner"></i>
          <span>Carregando...</span>
        </div>
      }

      <!-- Lista de dispositivos cadastrados -->
      @if (!loading()) {
        @if (credentials().length === 0) {
          <div class="bm-empty">
            <i class="pi pi-fingerprint" style="font-size: 2rem; opacity: .3"></i>
            <p>Nenhuma biometria cadastrada para este aluno.</p>
          </div>
        } @else {
          <ul class="bm-list">
            @for (cred of credentials(); track cred.id) {
              <li class="bm-item">
                <div class="bm-item-info">
                  <i class="pi pi-mobile"></i>
                  <span class="bm-device-name">{{ cred.device_name }}</span>
                  <span class="bm-date">
                    Cadastrado em {{ cred.created_at | date:'dd/MM/yyyy' }}
                    @if (cred.last_used_at) {
                      · Último uso {{ cred.last_used_at | date:'dd/MM/yyyy HH:mm' }}
                    }
                  </span>
                </div>
                <p-button
                  icon="pi pi-trash"
                  severity="danger"
                  [text]="true"
                  [rounded]="true"
                  pTooltip="Remover dispositivo"
                  (onClick)="confirmDelete(cred)"
                  [disabled]="saving()" />
              </li>
            }
          </ul>
        }

        <!-- Ações -->
        <div class="bm-actions">
          <p-button
            label="Cadastrar novo dispositivo"
            icon="pi pi-plus"
            severity="secondary"
            [outlined]="true"
            [disabled]="supported() === false || saving()"
            (onClick)="openRegisterDialog()" />

          @if (credentials().length > 0) {
            <p-button
              label="Testar biometria"
              icon="pi pi-fingerprint"
              severity="info"
              [outlined]="true"
              [disabled]="supported() === false || saving()"
              [loading]="saving()"
              (onClick)="testAuth()" />
          }
        </div>
      }
    </div>

    <!-- Dialog de cadastro -->
    <p-dialog
      header="Cadastrar Biometria"
      [(visible)]="showRegisterDialog"
      [modal]="true"
      [style]="{ width: '400px' }">

      <div class="register-form">
        <p class="register-hint">
          <i class="pi pi-info-circle"></i>
          Dê um nome para identificar o dispositivo. Em seguida, o sistema
          solicitará sua digital ou Face ID.
        </p>
        <div class="p-field">
          <label for="deviceName">Nome do dispositivo</label>
          <input
            pInputText
            id="deviceName"
            [(ngModel)]="deviceName"
            placeholder="Ex: iPhone de João, Tablet da Clínica"
            class="w-full" />
        </div>
      </div>

      <ng-template pTemplate="footer">
        <p-button
          label="Cancelar"
          severity="secondary"
          [text]="true"
          (onClick)="showRegisterDialog = false" />
        <p-button
          label="Cadastrar Digital"
          icon="pi pi-fingerprint"
          [loading]="saving()"
          [disabled]="!deviceName.trim()"
          (onClick)="registerBiometric()" />
      </ng-template>
    </p-dialog>
  `,
  styles: [`
    .biometric-manager { padding: 1rem 0; }

    .bm-header {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1.25rem;
    }
    .bm-title {
      margin: 0;
      font-size: 1rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: .5rem;
    }
    .bm-loading {
      display: flex;
      align-items: center;
      gap: .5rem;
      color: var(--text-color-secondary);
      padding: .5rem 0;
    }
    .bm-empty {
      text-align: center;
      padding: 1.5rem;
      color: var(--text-color-secondary);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: .5rem;
    }
    .bm-list {
      list-style: none;
      padding: 0;
      margin: 0 0 1rem;
      display: flex;
      flex-direction: column;
      gap: .5rem;
    }
    .bm-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: .75rem 1rem;
      border: 1px solid var(--surface-border);
      border-radius: 8px;
      background: var(--surface-ground);
    }
    .bm-item-info {
      display: flex;
      flex-direction: column;
      gap: .25rem;
    }
    .bm-item-info > i { color: var(--primary-color); margin-bottom: .25rem; }
    .bm-device-name { font-weight: 600; font-size: .9rem; }
    .bm-date { font-size: .78rem; color: var(--text-color-secondary); }
    .bm-actions { display: flex; gap: .75rem; flex-wrap: wrap; }
    .register-hint {
      background: var(--blue-50);
      border-radius: 8px;
      padding: .75rem;
      font-size: .875rem;
      color: var(--blue-700);
      display: flex;
      gap: .5rem;
      margin-bottom: 1rem;
    }
    .p-field { display: flex; flex-direction: column; gap: .5rem; }
    .p-field label { font-weight: 600; font-size: .875rem; }
  `]
})
export class BiometricManagerComponent implements OnInit {
  @Input({ required: true }) patientId!: string;

  private biometricService = inject(BiometricService);
  private messageService   = inject(MessageService);
  private confirmService   = inject(ConfirmationService);

  credentials   = signal<BiometricCredential[]>([]);
  supported     = signal<boolean | null>(null);
  loading       = signal(false);
  saving        = signal(false);
  showRegisterDialog = false;
  deviceName    = '';

  ngOnInit() {
    // Verifica suporte ao WebAuthn no dispositivo atual
    this.biometricService.isSupported().then(s => this.supported.set(s));
    this.loadCredentials();
  }

  loadCredentials() {
    this.loading.set(true);
    this.biometricService.listCredentials(this.patientId).subscribe({
      next:  creds => { this.credentials.set(creds); this.loading.set(false); },
      error: ()    => { this.loading.set(false); }
    });
  }

  openRegisterDialog() {
    this.deviceName = '';
    this.showRegisterDialog = true;
  }

  registerBiometric() {
    if (!this.deviceName.trim()) return;
    this.saving.set(true);

    this.biometricService.register(this.patientId, this.deviceName).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Sucesso',
          detail: 'Biometria cadastrada com sucesso!'
        });
        this.showRegisterDialog = false;
        this.saving.set(false);
        this.loadCredentials();
      },
      error: (err) => {
        const msg = err?.error?.message || err?.message || 'Erro ao cadastrar biometria';
        this.messageService.add({ severity: 'error', summary: 'Erro', detail: msg });
        this.saving.set(false);
      }
    });
  }

  testAuth() {
    this.saving.set(true);
    this.biometricService.authenticateAndMarkAttendance(this.patientId).subscribe({
      next: (res) => {
        this.messageService.add({
          severity: 'success',
          summary: 'Autenticado!',
          detail: res.message
        });
        this.saving.set(false);
      },
      error: (err) => {
        const msg = err?.error?.message || 'Falha na autenticação';
        this.messageService.add({ severity: 'warn', summary: 'Atenção', detail: msg });
        this.saving.set(false);
      }
    });
  }

  confirmDelete(cred: BiometricCredential) {
    this.confirmService.confirm({
      message: `Remover o dispositivo "${cred.device_name}"? O aluno não poderá mais usar biometria neste dispositivo.`,
      header: 'Remover biometria',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Remover',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.deleteCredential(cred)
    });
  }

  deleteCredential(cred: BiometricCredential) {
    this.biometricService.deleteCredential(this.patientId, cred.id).subscribe({
      next: () => {
        this.credentials.update(list => list.filter(c => c.id !== cred.id));
        this.messageService.add({ severity: 'success', summary: 'Removido', detail: 'Biometria removida' });
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Erro', detail: 'Não foi possível remover' });
      }
    });
  }
}