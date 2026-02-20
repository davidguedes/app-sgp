import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import {
  ProfessionalDetail,
  ProfessionalFormData,
  ProfessionalHttpResponse,
  ProfessionalsDetailHttpResponse
} from '../models/user.model';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly API_URL = environment.apiUrl;

  professionalsSignal = signal<ProfessionalDetail[]>([]);

  constructor(private http: HttpClient) {}

  // ─────────────────────────────────────────────
  // LEITURA
  // ─────────────────────────────────────────────

  loadProfessionals(): void {
    this.http.get<ProfessionalsDetailHttpResponse>(`${this.API_URL}/users/professionals`).subscribe({
      next: ({ data }) => this.professionalsSignal.set(data),
      error: (err) => console.error('Erro ao carregar profissionais:', err)
    });
  }

  getProfessionals(): Observable<ProfessionalDetail[]> {
    return this.http.get<ProfessionalsDetailHttpResponse>(`${this.API_URL}/users/professionals`).pipe(
      map(r => r.data)
    );
  }

  // ─────────────────────────────────────────────
  // CRUD
  // ─────────────────────────────────────────────

  createProfessional(data: ProfessionalFormData): Observable<ProfessionalDetail> {
    return this.http.post<ProfessionalHttpResponse>(`${this.API_URL}/users/professionals`, data).pipe(
      tap(({ data: created }) => this._addToState(created)),
      map(r => r.data)
    );
  }

  updateProfessional(id: string, data: ProfessionalFormData): Observable<ProfessionalDetail> {
    return this.http.put<ProfessionalHttpResponse>(`${this.API_URL}/users/professionals/${id}`, data).pipe(
      tap(({ data: updated }) => this._updateInState(updated)),
      map(r => r.data)
    );
  }

  deleteProfessional(id: string): Observable<void> {
    return this.http.delete<void>(`${this.API_URL}/users/professionals/${id}`).pipe(
      tap(() => this._removeFromState(id))
    );
  }

  // ─────────────────────────────────────────────
  // STATE LOCAL
  // ─────────────────────────────────────────────

  private _addToState(p: ProfessionalDetail): void {
    this.professionalsSignal.update(list => [p, ...list]);
  }

  private _updateInState(p: ProfessionalDetail): void {
    this.professionalsSignal.update(list => list.map(x => x.id === p.id ? p : x));
  }

  private _removeFromState(id: string): void {
    this.professionalsSignal.update(list => list.filter(x => x.id !== id));
  }
}