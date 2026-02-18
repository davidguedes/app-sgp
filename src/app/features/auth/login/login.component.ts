import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { MessageModule } from 'primeng/message';
import { AuthService } from '../../../core/services/auth.service';
import { LoginCredentials } from '../../../core/models/user.model';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    InputTextModule,
    PasswordModule,
    MessageModule
  ],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent {
  credentials = signal<LoginCredentials>({ email: '', senha: '' });
  loading = signal(false);
  errorMessage = signal<string | null>(null);
  
  constructor(
    private authService: AuthService,
    private router: Router
  ) {}
  
  onSubmit(): void {
    if (!this.credentials().email || !this.credentials().senha) {
      this.errorMessage.set('Por favor, preencha todos os campos');
      return;
    }
    
    this.loading.set(true);
    this.errorMessage.set(null);

    console.log(this.credentials());

    // Use mockLogin para desenvolvimento ou login para produção
    this.authService.login(this.credentials()).subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigate(['/dashboard']);
      },
      error: (error) => {
        this.loading.set(false);
        this.errorMessage.set('Email ou senha inválidos');
        console.error('Erro no login:', error);
      }
    });
  }
  
  updateEmail(value: string): void {
    this.credentials.update(c => ({ ...c, email: value }));
  }
  
  updateSenha(value: string): void {
    this.credentials.update(c => ({ ...c, senha: value }));
  }
}