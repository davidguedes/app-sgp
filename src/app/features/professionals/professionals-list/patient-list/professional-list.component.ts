// src/app/features/professionals/professionals-list/professionals-list.component.ts
import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogModule } from 'primeng/dialog';
import { PasswordModule } from 'primeng/password';
import { MessageService, ConfirmationService } from 'primeng/api';
import { AvatarModule } from 'primeng/avatar';
import { ProfessionalDetail, ProfessionalFormData } from '../../../../core/models/user.model';
import { UserService } from '../../../../core/services/user.service';

@Component({
  selector: 'app-professionals-list',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    CardModule, ButtonModule, InputTextModule,
    TagModule, ToastModule, ConfirmDialogModule,
    DialogModule, PasswordModule, AvatarModule
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './professional-list.component.html',
  styleUrls: ['./professional-list.component.scss']
})
export class ProfessionalsListComponent implements OnInit {
  userService = inject(UserService);
  professionals = this.userService.professionalsSignal;
  loading = signal(false);
  searchQuery = signal('');

  // Dialog
  showDialog = signal(false);
  isEditMode = signal(false);
  editingId = signal<string | null>(null);
  saving = signal(false);

  formData: ProfessionalFormData = { nome: '', email: '', senha: '' };
  showPassword = false;

  filtered = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    if (!q) return this.professionals();
    return this.professionals().filter(p =>
      p.nome.toLowerCase().includes(q) || p.email.toLowerCase().includes(q)
    );
  });

  constructor(
    private messageService: MessageService,
    private confirmationService: ConfirmationService
  ) {}

  ngOnInit(): void {
    this.loading.set(true);
    this.userService.getProfessionals().subscribe({
      next: (data) => {
        this.userService.professionalsSignal.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Erro', detail: 'Não foi possível carregar os profissionais' });
        this.loading.set(false);
      }
    });
  }

  // ─────────────────────────────────────────────
  // DIALOG
  // ─────────────────────────────────────────────

  openCreate(): void {
    this.formData = { nome: '', email: '', senha: '' };
    this.isEditMode.set(false);
    this.editingId.set(null);
    this.showDialog.set(true);
  }

  openEdit(professional: ProfessionalDetail): void {
    this.formData = { nome: professional.nome, email: professional.email, senha: '' };
    this.isEditMode.set(true);
    this.editingId.set(professional.id);
    this.showDialog.set(true);
  }

  closeDialog(): void {
    this.showDialog.set(false);
  }

  save(): void {
    if (!this.formData.nome.trim()) {
      this.messageService.add({ severity: 'warn', summary: 'Atenção', detail: 'Informe o nome do profissional' });
      return;
    }
    if (!this.formData.email.trim()) {
      this.messageService.add({ severity: 'warn', summary: 'Atenção', detail: 'Informe o e-mail' });
      return;
    }
    if (!this.isEditMode() && !this.formData.senha?.trim()) {
      this.messageService.add({ severity: 'warn', summary: 'Atenção', detail: 'Informe uma senha para o novo profissional' });
      return;
    }

    this.saving.set(true);

    const payload: ProfessionalFormData = {
      nome: this.formData.nome.trim(),
      email: this.formData.email.trim(),
      ...(this.formData.senha?.trim() ? { senha: this.formData.senha } : {})
    };

    const operation$ = this.isEditMode() && this.editingId()
      ? this.userService.updateProfessional(this.editingId()!, payload)
      : this.userService.createProfessional(payload);

    operation$.subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Sucesso',
          detail: this.isEditMode() ? 'Profissional atualizado' : 'Profissional cadastrado'
        });
        this.showDialog.set(false);
        this.saving.set(false);
      },
      error: (err) => {
        const msg = err?.error?.message || 'Não foi possível salvar';
        this.messageService.add({ severity: 'error', summary: 'Erro', detail: msg });
        this.saving.set(false);
      }
    });
  }

  // ─────────────────────────────────────────────
  // EXCLUSÃO
  // ─────────────────────────────────────────────

  confirmDelete(professional: ProfessionalDetail): void {
    this.confirmationService.confirm({
      message: `Deseja excluir o profissional <strong>${professional.nome}</strong>?<br><small>Esta ação não poderá ser desfeita.</small>`,
      header: 'Confirmar Exclusão',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Sim, excluir',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.userService.deleteProfessional(professional.id).subscribe({
          next: () => {
            this.messageService.add({ severity: 'success', summary: 'Sucesso', detail: 'Profissional excluído' });
          },
          error: (err) => {
            const msg = err?.error?.message || 'Não foi possível excluir';
            this.messageService.add({ severity: 'error', summary: 'Erro', detail: msg });
          }
        });
      }
    });
  }

  // ─────────────────────────────────────────────
  // UTILS
  // ─────────────────────────────────────────────

  getInitials(name: string): string {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
  }

  getAvatarColor(name: string): string {
    return ['#7a9e7e', '#c4956a', '#5a8f5a', '#d4a574', '#4e6e52'][name.charCodeAt(0) % 5];
  }
}