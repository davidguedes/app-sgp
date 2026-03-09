import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, forkJoin, map, tap } from 'rxjs';
import {
  Patient,
  PatientDetail,
  PatientFormData,
  PatientHttpResponse,
  PatientsHttpResponse,
  PatientStats,
  PatientStatsHttpResponse
} from '../models/patient.model';
import { Attendance, AttendanceFormData, AttendanceHttpResponse, AttendancesHttpResponse, AvulsoAttendance, AvulsoFormData  } from '../models/attendance.model';
import { Evolution, EvolutionFormData, EvolutionHttpResponse, EvolutionsHttpResponse } from '../models/evolution.model';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class PatientService {
  private readonly API_URL = environment.apiUrl;

  private patientsSubject = new BehaviorSubject<Patient[]>([]);
  public patients$ = this.patientsSubject.asObservable();
  public patientsSignal = signal<Patient[]>([]);

  constructor(private http: HttpClient) {
    // NÃO carrega no construtor — chamado explicitamente pelo componente que precisar
  }

  // ─────────────────────────────────────────────
  // PACIENTES
  // ─────────────────────────────────────────────

  loadPatients(): void {
    this.http.get<PatientsHttpResponse>(`${this.API_URL}/patients`).subscribe({
      next: ({ data }) => {
        this.patientsSubject.next(data);
        this.patientsSignal.set(data);
      },
      error: (err) => console.error('Erro ao carregar pacientes:', err)
    });
  }

  getPatients(): Observable<Patient[]> {
    return this.patients$;
  }

  getPatientsByPeriod(start: string, end: string): Observable<Patient[]> {
    return this.http
      .get<PatientsHttpResponse>(`${this.API_URL}/patients/financial?start=${start}&end=${end}`)
      .pipe(map(r => r.data));
  }

  // Utilitário para montar start/end de um mês
  static monthRange(ref: Date): { start: string; end: string } {
    const y = ref.getFullYear();
    const m = ref.getMonth();
    const start = new Date(y, m, 1).toISOString().split('T')[0];
    const end   = new Date(y, m + 1, 0).toISOString().split('T')[0];
    return { start, end };
  }

  /** Carrega paciente com attendance e evolutions — usar apenas na tela de detalhes */
  getPatientById(id: string): Observable<PatientDetail> {
    return forkJoin({
      patient:    this.http.get<PatientHttpResponse>(`${this.API_URL}/patients/${id}`),
      attendance: this.http.get<AttendancesHttpResponse>(`${this.API_URL}/attendance/${id}/attendance`),
      evolutions: this.http.get<EvolutionsHttpResponse>(`${this.API_URL}/evolution/${id}/evolutions`)
    }).pipe(
      map(({ patient, attendance, evolutions }) => ({
        ...patient.data,
        attendance: attendance.data,
        evolutions: evolutions.data
      }))
    );
  }

  createPatient(formData: PatientFormData): Observable<Patient> {
    return this.http.post<PatientHttpResponse>(`${this.API_URL}/patients`, formData)
    .pipe(
      tap(({ data }) => this._addToState(data)),
      map(({ data }) => data)
    );
  }

  updatePatient(id: string, formData: PatientFormData): Observable<Patient> {
    return this.http
      .put<PatientHttpResponse>(`${this.API_URL}/patients/${id}`, formData)
      .pipe(
        tap(({ data }) => this._updateInState(data)),
        map(({ data }) => data)
      );
  }

  deletePatient(id: string): Observable<void> {
    return this.http.delete<void>(`${this.API_URL}/patients/${id}`).pipe(
      tap(() => this._removeFromState(id))
    );
  }

  // ─────────────────────────────────────────────
  // FREQUÊNCIA
  // ─────────────────────────────────────────────

  addAttendance(patientId: string, data: AttendanceFormData): Observable<Attendance> {
    return this.http.post<AttendanceHttpResponse>(`${this.API_URL}/attendance/${patientId}/attendance`, data).pipe(
      map(({ data }) => data)
    );
  }

  updateAttendance(patientId: string, attendanceId: string, data: AttendanceFormData): Observable<Attendance> {
    return this.http.put<AttendanceHttpResponse>(`${this.API_URL}/attendance/${patientId}/attendance/${attendanceId}`, data).pipe(
      map(({ data }) => data)
    );
  }

  deleteAttendance(patientId: string, attendanceId: string): Observable<void> {
    return this.http.delete<void>(`${this.API_URL}/attendance/${patientId}/attendance/${attendanceId}`);
  }

  getAttendanceByPatient(patientId: string): Observable<Attendance[]> {
    return this.http.get<AttendancesHttpResponse>(`${this.API_URL}/attendance/${patientId}/attendance`).pipe(
      map(r => r.data)
    );
  }

  getAttendanceByDate(date: string): Observable<Attendance[]> {
    return this.http.get<AttendancesHttpResponse>(`${this.API_URL}/attendance?date=${date}`).pipe(
      map(r => r.data)
    );
  }

  createAvulso(data: AvulsoFormData): Observable<Attendance[]> {
    return this.http
      .post<{ success: boolean; data: Attendance[] }>(
        `${this.API_URL}/attendance/avulso`,
        {
          ...data,
          // Garante formato YYYY-MM-DD independente do timezone
          date: data.date instanceof Date
            ? data.date.toISOString().split('T')[0]
            : data.date
        }
      )
      .pipe(map(r => r.data));
  }

  getAvulsoByPeriod(start: string, end: string): Observable<AvulsoAttendance[]> {
    return this.http
      .get<{ success: boolean; data: AvulsoAttendance[] }>(
        `${this.API_URL}/attendance/avulso?start=${start}&end=${end}`
      )
      .pipe(map(r => r.data));
  }

  // ─────────────────────────────────────────────
  // EVOLUÇÕES
  // ─────────────────────────────────────────────

  addEvolution(patientId: string, data: EvolutionFormData): Observable<Evolution> {
    return this.http.post<EvolutionHttpResponse>(`${this.API_URL}/evolution/${patientId}/evolutions`, data).pipe(
      map(({ data }) => data));
  }

  updateEvolution(patientId: string, evolutionId: string, data: EvolutionFormData): Observable<Evolution> {
    return this.http.put<EvolutionHttpResponse>(`${this.API_URL}/evolution/${patientId}/evolutions/${evolutionId}`, data).pipe(
      map(({ data }) => data)
    );
  }

  deleteEvolution(patientId: string, evolutionId: string): Observable<void> {
    return this.http.delete<void>(`${this.API_URL}/evolution/${patientId}/evolutions/${evolutionId}`);
  }

  // ─────────────────────────────────────────────
  // STATS — calculado no backend
  // ─────────────────────────────────────────────

  getStats(): Observable<PatientStats> {
    return this.http.get<PatientStatsHttpResponse>(`${this.API_URL}/patients/stats`).pipe(
      map(r => r.data)
    );
  }

  // ─────────────────────────────────────────────
  // FILTROS
  // ─────────────────────────────────────────────

  filterByProfessional(professionalId: string): Observable<Patient[]> {
    return this.patients$.pipe(
      map(patients => patients.filter(p => p.profissional_id.toString() === professionalId))
    );
  }

  filterByDay(day: string): Observable<Patient[]> {
    return this.patients$.pipe(
      map(patients => patients.filter(p => p.dias.includes(day)))
    );
  }

  searchByName(query: string): Observable<Patient[]> {
    const lowerQuery = query.toLowerCase();
    return this.patients$.pipe(
      map(patients => patients.filter(p => p.nome.toLowerCase().includes(lowerQuery)))
    );
  }

  // ─────────────────────────────────────────────
  // STATE LOCAL — evita reload total
  // ─────────────────────────────────────────────

  private _addToState(patient: Patient): void {
    const current = this.patientsSubject.getValue();
    const updated = [patient, ...current];
    this.patientsSubject.next(updated);
    this.patientsSignal.set(updated);
  }

  private _updateInState(patient: Patient): void {
    const updated = this.patientsSubject.getValue().map(p => p.id === patient.id ? patient : p);
    this.patientsSubject.next(updated);
    this.patientsSignal.set(updated);
  }

  private _removeFromState(id: string): void {
    const updated = this.patientsSubject.getValue().filter(p => p.id !== id);
    this.patientsSubject.next(updated);
    this.patientsSignal.set(updated);
  }
}