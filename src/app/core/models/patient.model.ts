import { Attendance } from './attendance.model';
import { Evolution } from './evolution.model';

export interface Patient {
  id: string;
  nome: string;
  profissional_id: number;
  profissional_nome: string;
  dias: string[];
  horarios?: { [key: string]: string };
  valor: number;
  porcentagem: number;
  base: number;
  ganho: number;
  ganho_fixo?: number | null;   // valor fixo — quando preenchido, sobrescreve o cálculo por %
  data_inicio: Date;
  data_fim?: Date;
  total_attendance?: number;
  total_evolutions?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PatientDetail extends Patient {
  attendance: Attendance[];
  evolutions: Evolution[];
}

export interface PatientHttpResponse {
  data: Patient;
  success: boolean;
}

export interface PatientDetailHttpResponse {
  data: PatientDetail;
  success: boolean;
}

export interface PatientsHttpResponse {
  data: Patient[];
  success: boolean;
}

export interface PatientFormData {
  nome: string;
  profissional: number;
  dias: string[];
  horarios?: { [key: string]: string };
  valor: number;
  porcentagem: number;
  ganho_fixo?: number | null;   // null = usar cálculo por %; número = valor fixo manual
  data_inicio: Date;
  data_fim?: Date;
}

export interface PatientStats {
  totalAlunos: number;
  ganhoTotal: number;
  presencas: number;
  faltas: number;
  taxaPresenca: number;
}

export interface PatientStatsHttpResponse {
  data: PatientStats;
  success: boolean;
}

export interface DayOfWeek {
  key: string;
  label: string;
  selected: boolean;
}

export const DAYS_OF_WEEK: DayOfWeek[] = [
  { key: 'seg', label: 'SEG', selected: false },
  { key: 'ter', label: 'TER', selected: false },
  { key: 'qua', label: 'QUA', selected: false },
  { key: 'qui', label: 'QUI', selected: false },
  { key: 'sex', label: 'SEX', selected: false },
  { key: 'sab', label: 'SÁB', selected: false }
];