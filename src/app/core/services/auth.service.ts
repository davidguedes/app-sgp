import { computed, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, BehaviorSubject, tap, catchError, of } from 'rxjs';
import { User, LoginCredentials, AuthResponse, ProfessionalsHttpResponse, Professional } from '../models/user.model';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly API_URL = environment.apiUrl;
  private readonly TOKEN_KEY = 'pilates_token';
  private readonly USER_KEY = 'pilates_user';
  
  private currentUserSubject = new BehaviorSubject<User | null>(this.getUserFromStorage());
  public currentUser$ = this.currentUserSubject.asObservable();
  
  // Signal para estado reativo
  public currentUserSignal = signal<User | null>(this.getUserFromStorage());

  private professionalsSignal = signal<Professional[]>([]);
  readonly professionals = this.professionalsSignal.asReadonly();

  constructor(
    private http: HttpClient,
    private router: Router
  ) {}
  
  /**
   * Realiza login do usuário
   */
  login(credentials: LoginCredentials): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.API_URL}/auth/login`, credentials).pipe(
      tap(response => {
        this.setSession(response);
      }),
      catchError(error => {
        console.error('Erro no login:', error);
        throw error;
      })
    );
  }
  
  /**
   * Realiza logout do usuário
   */
  logout(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    this.currentUserSubject.next(null);
    this.currentUserSignal.set(null);
    this.router.navigate(['/login']);
  }
  
  /**
   * Verifica se usuário está autenticado
   */
  isAuthenticated(): boolean {
    const token = this.getToken();
    console.log('token: ', token);
    return !!token && !this.isTokenExpired(token);
  }
  
  /**
   * Obtém o token do localStorage
   */
  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }
  
  /**
   * Obtém o usuário atual
   */
  getCurrentUser(): User | null {
    return this.currentUserSubject.value;
  }
  
  /**
   * Verifica se usuário é gestor
   */
  isGestor(): boolean {
    const user = this.getCurrentUser();
    return user?.role === 'gestor';
  }
  
  /**
   * Verifica se usuário é profissional
   */
  isProfissional(): boolean {
    const user = this.getCurrentUser();
    return user?.role === 'profissional';
  }
  
  /**
   * Configura sessão do usuário
   */
  private setSession(authResult: AuthResponse): void {
    localStorage.setItem(this.TOKEN_KEY, authResult.token);
    localStorage.setItem(this.USER_KEY, JSON.stringify(authResult.user));
    this.currentUserSubject.next(authResult.user);
    this.currentUserSignal.set(authResult.user);
  }
  
  /**
   * Obtém usuário do localStorage
   */
  private getUserFromStorage(): User | null {
    const userJson = localStorage.getItem(this.USER_KEY);
    if (userJson) {
      try {
        return JSON.parse(userJson);
      } catch {
        return null;
      }
    }
    return null;
  }
  
  /**
   * Verifica se token está expirado
   */
  private isTokenExpired(token: string): boolean {
   try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return Math.floor(Date.now() / 1000) >= payload.exp;
    }
    catch {
      return true;
    }
  }

  loadProfessionals(): void {
    this.http.get<ProfessionalsHttpResponse>(`${this.API_URL}/auth/professionals`).subscribe({
      next: (result) => {
        this.professionalsSignal.set(result.data);
      },
      error: (error) => console.error('Erro ao carregar profissionais:', error)
    });
  }

  readonly professionalsMap = computed<Record<string, string>>(() => {
    return this.professionals().reduce((acc, prof) => {
      acc[prof.id] = prof.nome;
      return acc;
    }, {} as Record<string, string>);
  });

  readonly professionalsData = computed<ProfessionalsHttpResponse['data']>(() => {
    return this.professionals();
  });

  getProfessionalName(id: number): string {
    return this.professionalsMap()[id] ?? id;
  }
}