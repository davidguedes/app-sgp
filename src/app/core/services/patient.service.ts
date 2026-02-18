import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, tap, map, forkJoin } from 'rxjs';
import { Patient, PatientFormData, PatientHttpResponse, PatientsHttpResponse, PatientStats } from '../models/patient.model';
import { Attendance, AttendanceFormData, AttendanceHttpResponse } from '../models/attendance.model';
import { Evolution, EvolutionFormData, EvolutionHttpResponse } from '../models/evolution.model';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class PatientService {
  private readonly API_URL = environment.apiUrl;
  
  private patientsSubject = new BehaviorSubject<Patient[]>([]);
  public patients$ = this.patientsSubject.asObservable();
  
  // Signal para estado reativo
  public patientsSignal = signal<Patient[]>([]);

  private attendanceSubject = new BehaviorSubject<Attendance[]>([]);
  public attendance$ = this.attendanceSubject.asObservable();
  public attendanceSignal = signal<Attendance[]>([]);

  private evolutionsSubject = new BehaviorSubject<Evolution[]>([]);
  public evolutions$ = this.evolutionsSubject.asObservable();
  public evolutionsSignal = signal<Evolution[]>([]);
  
  constructor(private http: HttpClient) {
    this.loadPatients();
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PACIENTES
  // ═══════════════════════════════════════════════════════════════════════════
  
  /**
   * Carrega todos os pacientes
   */
  loadPatients(): void {
    this.http.get<PatientsHttpResponse>(`${this.API_URL}/patients`).subscribe({
      next: (patients) => {
        this.patientsSubject.next(patients.data);
        this.patientsSignal.set(patients.data);
      },
      error: (error) => console.error('Erro ao carregar pacientes:', error)
    });
  }
  
  loadEvolutionByPatient(patient: string): void {
    this.http.get<EvolutionHttpResponse>(`${this.API_URL}/patients/${patient}/evolutions`).subscribe({
      next: (response) => {
        this.evolutionsSubject.next(response.data);
        this.evolutionsSignal.set(response.data);
      },
      error: (error) => console.error('Erro ao carregar evoluções:', error)
    });
  }

  loadAttendanceByPatient(patient: string): void {
    this.http.get<AttendanceHttpResponse>(`${this.API_URL}/patients/${patient}/attendance`).subscribe({
      next: (response) => {
        this.attendanceSubject.next(response.data);
        this.attendanceSignal.set(response.data);
      },
      error: (error) => console.error('Erro ao carregar frequências:', error)
    });
  }

  /**
   * Obtém todos os pacientes
   */
  getPatients(): Observable<Patient[]> {
    return this.patients$;
  }
  
  /**
   * Obtém paciente por ID
   */
  getPatientById(id: string): Observable<Patient> {
    // forkJoin garante que os 3 requests terminam antes de montar o objeto
    return forkJoin({
      patient:    this.http.get<PatientHttpResponse>(`${this.API_URL}/patients/${id}`),
      attendance: this.http.get<AttendanceHttpResponse>(`${this.API_URL}/patients/${id}/attendance`),
      evolutions: this.http.get<EvolutionHttpResponse>(`${this.API_URL}/patients/${id}/evolutions`)
    }).pipe(
      map(({ patient, attendance, evolutions }) => ({
        ...patient.data,
        attendance: attendance.data,
        evolutions: evolutions.data
      }))
    );
  }
  
  /**
   * Cria novo paciente
   */
  createPatient(formData: PatientFormData): Observable<Patient> {
    const { base, ganho } = this.calcularLiquido(formData.valor, formData.porcentagem);
    return this.http.post<Patient>(`${this.API_URL}/patients`, { ...formData, base, ganho, attendance: [], evolutions: [] }).pipe(
      tap(() => this.loadPatients())
    );
  }
  
  /**
   * Atualiza paciente
   */
  updatePatient(id: string, formData: PatientFormData): Observable<Patient> {
    const { base, ganho } = this.calcularLiquido(formData.valor, formData.porcentagem);
    return this.http.put<Patient>(`${this.API_URL}/patients/${id}`, { ...formData, base, ganho }).pipe(
      tap(() => this.loadPatients())
    );
  }
  
  /**
   * Exclui paciente
   */
  deletePatient(id: string): Observable<void> {
    return this.http.delete<void>(`${this.API_URL}/patients/${id}`).pipe(
      tap(() => this.loadPatients())
    );
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // FREQUÊNCIA
  // ═══════════════════════════════════════════════════════════════════════════
  
  /**
   * Adiciona registro de frequência
   */
  addAttendance(patientId: string, data: AttendanceFormData): Observable<Attendance> {
    return this.http.post<Attendance>(`${this.API_URL}/patients/${patientId}/attendance`, data).pipe(
      tap(() => this.loadPatients())
    );
  }
  
  /**
   * Atualiza registro de frequência
   */
  updateAttendance(patientId: string, attendanceId: string, data: AttendanceFormData): Observable<Attendance> {
    return this.http.put<Attendance>(`${this.API_URL}/patients/${patientId}/attendance/${attendanceId}`, data).pipe(
      tap(() => this.loadPatients())
    );
  }
  
  /**
   * Remove registro de frequência
   */
  deleteAttendance(patientId: string, attendanceId: string): Observable<void> {
    return this.http.delete<void>(`${this.API_URL}/patients/${patientId}/attendance/${attendanceId}`).pipe(
      tap(() => this.loadPatients())
    );
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // EVOLUÇÕES
  // ═══════════════════════════════════════════════════════════════════════════
  
  /**
   * Adiciona evolução
   */
  addEvolution(patientId: string, data: EvolutionFormData): Observable<Evolution> {
    return this.http.post<Evolution>(`${this.API_URL}/patients/${patientId}/evolutions`, data).pipe(
      tap(() => this.loadPatients())
    );
  }
  
  /**
   * Atualiza evolução
   */
  updateEvolution(patientId: string, evolutionId: string, data: EvolutionFormData): Observable<Evolution> {
    return this.http.put<Evolution>(
      `${this.API_URL}/patients/${patientId}/evolutions/${evolutionId}`,
      data
    ).pipe(
      tap(() => this.loadPatients())
    );
  }
  
  /**
   * Remove evolução
   */
  deleteEvolution(patientId: string, evolutionId: string): Observable<void> {
    return this.http.delete<void>(
      `${this.API_URL}/patients/${patientId}/evolutions/${evolutionId}`
    ).pipe(
      tap(() => this.loadPatients())
    );
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CÁLCULOS E ESTATÍSTICAS
  // ═══════════════════════════════════════════════════════════════════════════
  
  /**
   * Calcula valor líquido baseado no valor e porcentagem
   */
  private calcularLiquido(valor: number, porcentagem: number): { base: number; ganho: number } {
    const base = (valor * porcentagem) / 100;
    const ganho = valor - base;
    return { base, ganho };
  }
  
  /**
   * Obtém estatísticas gerais
   */
  getStats(): Observable<PatientStats> {
    return this.patients$.pipe(
      map(patients => {
        const totalAlunos = patients.length;
        const ganhoTotal = patients.reduce((sum, p) => sum + p.ganho, 0);
        let presencas = 0;
        let faltas = 0;
        patients.forEach(p => {
          if (p.attendance) {
            presencas += p.attendance.filter(a => a.status === 'present').length;
            faltas += p.attendance.filter(a => a.status === 'absent').length;
          }
        });
        const total = presencas + faltas;
        const taxaPresenca = total > 0 ? (presencas / total) * 100 : 0;
        return { totalAlunos, ganhoTotal, presencas, faltas, taxaPresenca };
      })
    );
  }
  
  /**
   * Filtra pacientes por profissional
   */
  filterByProfessional(professionalId: string): Observable<Patient[]> {
    return this.patients$.pipe(
      map(patients => patients.filter(p => p.profissional_id.toString() === professionalId))
    );
  }
  
  /**
   * Filtra pacientes por dia da semana
   */
  filterByDay(day: string): Observable<Patient[]> {
    return this.patients$.pipe(
      map(patients => patients.filter(p => p.dias.includes(day)))
    );
  }
  
  /**
   * Busca pacientes por nome
   */
  searchByName(query: string): Observable<Patient[]> {
    const lowerQuery = query.toLowerCase();
    return this.patients$.pipe(
      map(patients => patients.filter(p => 
        p.nome.toLowerCase().includes(lowerQuery)
      ))
    );
  }

  getAttendanceByPatient(patientId: string): Observable<Attendance[]> {
    return this.http.get<AttendanceHttpResponse>(`${this.API_URL}/patients/${patientId}/attendance`).pipe(
      map(r => r.data)
    );
  }
}