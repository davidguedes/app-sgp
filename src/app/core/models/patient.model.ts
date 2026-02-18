import { Attendance } from './attendance.model';
import { Evolution } from './evolution.model';

export interface Patient {
  id: string;
  nome: string;
  profissional_id: number;
  profissional_nome: string;
  dias: string[]; // ['seg', 'qua', 'sex']
  horarios?: { [key: string]: string }; // { 'seg': '09:00', 'qua': '14:00' }
  valor: number;
  porcentagem: number;
  base: number;
  ganho: number;
  data_inicio: Date; // Data de início das aulas
  data_fim?: Date; // Data de término (opcional - null se ainda ativo)
  attendance: Attendance[];
  evolutions: Evolution[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PatientHttpResponse {
  data: Patient;
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