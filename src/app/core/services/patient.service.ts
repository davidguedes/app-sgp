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
  PatientStatsHttpResponse,
} from '../models/patient.model';
import {
  Attendance,
  AttendanceFormData,
  AttendanceHttpResponse,
  AttendancesHttpResponse,
  AvulsoAttendance,
  AvulsoFormData,
  PendingMakeup,
  PendingMakeupsHttpResponse,
  ResolveRepostoFormData,
  ResolveRepostoHttpResponse,
} from '../models/attendance.model';
import {
  Evolution,
  EvolutionFormData,
  EvolutionHttpResponse,
  EvolutionsHttpResponse,
} from '../models/evolution.model';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class PatientService {
  private readonly API_URL = environment.apiUrl;

  private patientsSubject = new BehaviorSubject<Patient[]>([]);
  public patients$ = this.patientsSubject.asObservable();
  public patientsSignal = signal<Patient[]>([]);

  constructor(private http: HttpClient) {}

  // ─────────────────────────────────────────────
  // PACIENTES
  // ─────────────────────────────────────────────

  /** Carrega lista geral (dashboard, listagem). Não filtra por período. */
  loadPatients(): void {
    this.http.get<PatientsHttpResponse>(`${this.API_URL}/patients`).subscribe({
      next: ({ data }) => {
        this.patientsSubject.next(data);
        this.patientsSignal.set(data);
      },
      error: (err) => console.error('Erro ao carregar pacientes:', err),
    });
  }

  getPatients(): Observable<Patient[]> {
    return this.patients$;
  }

  /**
   * Retorna pacientes ativos no período com cálculos financeiros corretos.
   * Use exclusivamente no financeiro e no resumo mensal do dashboard.
   *
   * O backend filtra alunos por data_inicio/data_fim e conta aulas_realizadas
   * apenas dentro do intervalo — então ganho_liquido_periodo já vem correto
   * para fixo, convênio e experimental sem nenhum cálculo adicional no Angular.
   */
  getPatientsByPeriod(start: string, end: string): Observable<Patient[]> {
    return this.http
      .get<PatientsHttpResponse>(`${this.API_URL}/patients/financial?start=${start}&end=${end}`)
      .pipe(map((r) => r.data));
  }

  /** Utilitário: monta start/end do mês de uma data de referência */
  static monthRange(ref: Date): { start: string; end: string } {
    const y = ref.getFullYear();
    const m = ref.getMonth();
    const start = new Date(y, m, 1).toISOString().split('T')[0];
    const end = new Date(y, m + 1, 0).toISOString().split('T')[0];
    return { start, end };
  }

  /** Carrega detalhes de um paciente (attendance + evolutions). Use só na tela de detalhes. */
  getPatientById(id: string): Observable<PatientDetail> {
    return forkJoin({
      patient: this.http.get<PatientHttpResponse>(`${this.API_URL}/patients/${id}`),
      attendance: this.http.get<AttendancesHttpResponse>(
        `${this.API_URL}/attendance/${id}/attendance`,
      ),
      evolutions: this.http.get<EvolutionsHttpResponse>(
        `${this.API_URL}/evolution/${id}/evolutions`,
      ),
    }).pipe(
      map(({ patient, attendance, evolutions }) => ({
        ...patient.data,
        attendance: attendance.data,
        evolutions: evolutions.data,
      })),
    );
  }

  createPatient(formData: PatientFormData): Observable<Patient> {
    return this.http.post<PatientHttpResponse>(`${this.API_URL}/patients`, formData).pipe(
      tap(({ data }) => this._addToState(data)),
      map(({ data }) => data),
    );
  }

  updatePatient(id: string, formData: PatientFormData): Observable<Patient> {
    return this.http.put<PatientHttpResponse>(`${this.API_URL}/patients/${id}`, formData).pipe(
      tap(({ data }) => this._updateInState(data)),
      map(({ data }) => data),
    );
  }

  deletePatient(id: string): Observable<void> {
    return this.http
      .delete<void>(`${this.API_URL}/patients/${id}`)
      .pipe(tap(() => this._removeFromState(id)));
  }

  // ─────────────────────────────────────────────
  // FREQUÊNCIA
  // ─────────────────────────────────────────────

  addAttendance(patientId: string, data: AttendanceFormData): Observable<Attendance> {
    return this.http
      .post<AttendanceHttpResponse>(`${this.API_URL}/attendance/${patientId}/attendance`, data)
      .pipe(map(({ data }) => data));
  }

  updateAttendance(
    patientId: string,
    attendanceId: string,
    data: AttendanceFormData,
  ): Observable<Attendance> {
    return this.http
      .put<AttendanceHttpResponse>(
        `${this.API_URL}/attendance/${patientId}/attendance/${attendanceId}`,
        data,
      )
      .pipe(map(({ data }) => data));
  }

  deleteAttendance(patientId: string, attendanceId: string): Observable<void> {
    return this.http.delete<void>(
      `${this.API_URL}/attendance/${patientId}/attendance/${attendanceId}`,
    );
  }

  getAttendanceByPatient(patientId: string): Observable<Attendance[]> {
    return this.http
      .get<AttendancesHttpResponse>(`${this.API_URL}/attendance/${patientId}/attendance`)
      .pipe(map((r) => r.data));
  }

  getAttendanceByDate(date: string): Observable<Attendance[]> {
    return this.http
      .get<AttendancesHttpResponse>(`${this.API_URL}/attendance?date=${date}`)
      .pipe(map((r) => r.data));
  }

  /**
   * Lista todos os registros makeup ainda não repostos no mês da data.
   * Retorna array de PendingMakeup ordenado por data ASC.
   * Apenas relevante para profissionais — gestor recebe [] do backend.
   */
  getPendingMakeupsList(date: string): Observable<PendingMakeup[]> {
    return this.http
      .get<PendingMakeupsHttpResponse>(`${this.API_URL}/attendance/pending-makeups?date=${date}`)
      .pipe(map((r) => r.data));
  }

  /**
   * Registra a realização de uma reposição atomicamente:
   * marca o makeup original como reposto e cria/atualiza a presença do dia.
   */
  resolveReposto(data: ResolveRepostoFormData): Observable<ResolveRepostoHttpResponse['data']> {
    return this.http
      .post<ResolveRepostoHttpResponse>(`${this.API_URL}/attendance/resolve-reposto`, data)
      .pipe(map((r) => r.data));
  }

  createAvulso(data: AvulsoFormData): Observable<Attendance[]> {
    return this.http
      .post<{ success: boolean; data: Attendance[] }>(`${this.API_URL}/attendance/avulso`, {
        ...data,
        date: data.date instanceof Date ? data.date.toISOString().split('T')[0] : data.date,
      })
      .pipe(map((r) => r.data));
  }

  getAvulsoByPeriod(start: string, end: string): Observable<AvulsoAttendance[]> {
    return this.http
      .get<{
        success: boolean;
        data: AvulsoAttendance[];
      }>(`${this.API_URL}/attendance/avulso?start=${start}&end=${end}`)
      .pipe(map((r) => r.data));
  }

  // ─────────────────────────────────────────────
  // EVOLUÇÕES
  // ─────────────────────────────────────────────

  addEvolution(patientId: string, data: EvolutionFormData): Observable<Evolution> {
    return this.http
      .post<EvolutionHttpResponse>(`${this.API_URL}/evolution/${patientId}/evolutions`, data)
      .pipe(map(({ data }) => data));
  }

  updateEvolution(
    patientId: string,
    evolutionId: string,
    data: EvolutionFormData,
  ): Observable<Evolution> {
    return this.http
      .put<EvolutionHttpResponse>(
        `${this.API_URL}/evolution/${patientId}/evolutions/${evolutionId}`,
        data,
      )
      .pipe(map(({ data }) => data));
  }

  deleteEvolution(patientId: string, evolutionId: string): Observable<void> {
    return this.http.delete<void>(
      `${this.API_URL}/evolution/${patientId}/evolutions/${evolutionId}`,
    );
  }

  // ─────────────────────────────────────────────
  // STATS
  // ─────────────────────────────────────────────

  /** Resumo histórico geral — usado como fallback ou exibição all-time. */
  getStats(): Observable<PatientStats> {
    return this.http
      .get<PatientStatsHttpResponse>(`${this.API_URL}/patients/stats`)
      .pipe(map((r) => r.data));
  }

  /**
   * Resumo financeiro de um período específico.
   * Retorna ganhoTotal correto para todas as modalidades no intervalo.
   * Use este no dashboard para exibir o resumo do mês atual.
   */
  getStatsByPeriod(start: string, end: string): Observable<PatientStats> {
    return this.http
      .get<PatientStatsHttpResponse>(
        `${this.API_URL}/patients/stats/period?start=${start}&end=${end}`,
      )
      .pipe(map((r) => r.data));
  }

  // ─────────────────────────────────────────────
  // FILTROS (lado cliente — para filtros rápidos de UI)
  // ─────────────────────────────────────────────

  filterByProfessional(professionalId: string): Observable<Patient[]> {
    return this.patients$.pipe(
      map((patients) => patients.filter((p) => p.profissional_id.toString() === professionalId)),
    );
  }

  filterByDay(day: string): Observable<Patient[]> {
    return this.patients$.pipe(map((patients) => patients.filter((p) => p.dias.includes(day))));
  }

  searchByName(query: string): Observable<Patient[]> {
    const lower = query.toLowerCase();
    return this.patients$.pipe(
      map((patients) => patients.filter((p) => p.nome.toLowerCase().includes(lower))),
    );
  }

  // ─────────────────────────────────────────────
  // STATE LOCAL
  // ─────────────────────────────────────────────

  private _addToState(patient: Patient): void {
    const updated = [patient, ...this.patientsSubject.getValue()];
    this.patientsSubject.next(updated);
    this.patientsSignal.set(updated);
  }

  private _updateInState(patient: Patient): void {
    const updated = this.patientsSubject.getValue().map((p) => (p.id === patient.id ? patient : p));
    this.patientsSubject.next(updated);
    this.patientsSignal.set(updated);
  }

  private _removeFromState(id: string): void {
    const updated = this.patientsSubject.getValue().filter((p) => p.id !== id);
    this.patientsSubject.next(updated);
    this.patientsSignal.set(updated);
  }

  /**
   * Agenda (ou reagenda) uma data para um registro makeup.
   * Não cria presença — apenas registra a intenção.
   */
  scheduleMakeup(makeupId: string, scheduledDate: string): Observable<Attendance> {
    return this.http
      .patch<AttendanceHttpResponse>(`${this.API_URL}/attendance/schedule-makeup`, {
        makeupId,
        scheduledDate,
      })
      .pipe(map((r) => r.data));
  }
}
