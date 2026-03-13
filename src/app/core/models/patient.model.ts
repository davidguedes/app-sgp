import { Attendance } from './attendance.model';
import { Evolution } from './evolution.model';

// ─────────────────────────────────────────────────────────────────────────────
// REGRA DE OURO: nunca calcule ganho/receita no Angular.
// Use sempre os campos calculados pelo backend.
//
// Campos financeiros por modalidade:
//
//   tipo='fixo':
//     valor               → pacote mensal (receita bruta)
//     base                → comissão bruta (valor × porcentagem / 100)
//     ganho               → líquido mensal (base × 0.85 ou ganho_fixo)
//     ganho_liquido_periodo → igual a `ganho` (já é mensal)
//
//   tipo='convenio':
//     valor               → 0 (convênio não tem pacote)
//     ganho               → valor por aula (armazenado no backend como ganho_fixo)
//     ganho_convenio      → ganho × aulas_realizadas NO PERÍODO
//     ganho_liquido_periodo → igual a `ganho_convenio`
//
//   tipo='experimental':
//     todos os valores financeiros = 0
//
// Para SOMAR receita de uma lista de pacientes (qualquer tipo), use SEMPRE:
//   patients.reduce((s, p) => s + p.ganho_liquido_periodo, 0)
// ─────────────────────────────────────────────────────────────────────────────

export interface Patient {
  id: string;
  nome: string;
  profissional_id: number;
  profissional_nome: string;
  tipo: 'fixo' | 'experimental' | 'convenio';

  // Dias e horários
  dias: string[];
  horarios?: { [key: string]: string };

  // Datas de vigência
  data_inicio: Date;
  data_fim?: Date;

  // Campos financeiros brutos (conforme cadastro)
  valor: number;           // pacote mensal — fixo: valor do pacote, convenio: 0
  porcentagem: number;
  base: number;            // comissão bruta antes do desconto operacional
  ganho: number;           // fixo: líquido mensal | convenio: valor por aula
  ganho_fixo?: number | null;

  // Campos calculados pelo backend por período
  aulas_realizadas?: number;
  ganho_convenio?: number | null;      // convenio: ganho × aulas no período
  ganho_liquido_periodo: number;       // ← USE ESTE para qualquer soma financeira

  // Contadores históricos
  total_attendance?: number;
  total_evolutions?: number;

  createdAt?: Date;
  updatedAt?: Date;
  has_biometric?: boolean;
}

// Usado na tela de detalhes — carregado sob demanda
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
  tipo: 'fixo' | 'experimental' | 'convenio';
  dias: string[];
  horarios?: { [key: string]: string };
  valor: number;
  porcentagem: number;
  ganho_fixo?: number | null;
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