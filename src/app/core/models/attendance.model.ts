export interface Attendance {
  id: string;
  patient_id: string;
  date: Date;
  status: 'present' | 'absent' | 'makeup';
  tipo?: 'regular' | 'avulso';
  valor?: number;
  notes?: string;
  // ── Campos de controle de reposição ──────────────
  reposto?: boolean;           // TRUE quando o makeup foi quitado por uma reposição
  makeup_origin_id?: string;   // INTEGER referenciando attendance.id   // Na presença da reposição: aponta pro makeup original
  // ─────────────────────────────────────────────────
  createdAt?: Date;
}

export interface AttendancesHttpResponse {
  data: Attendance[];
  success: boolean;
}

export interface AttendanceHttpResponse {
  data: Attendance;
  success: boolean;
}

export interface AttendanceFormData {
  date: Date;
  status: 'present' | 'absent' | 'makeup';
  notes?: string;
}

export interface AvulsoFormData {
  patient_ids: string[];
  date: Date;
  valor: number;
  notes?: string;
}

export interface AttendanceStats {
  present: number;
  absent: number;
  makeup: number;
  total: number;
  attendanceRate: number;
}

export type AttendanceStatus = 'present' | 'absent' | 'makeup';

export const ATTENDANCE_STATUS_CONFIG = {
  present: {
    label: 'Presente',
    icon: 'pi pi-check-circle',
    class: 'present',
    color: '#5a8f5a'
  },
  absent: {
    label: 'Faltou',
    icon: 'pi pi-times-circle',
    class: 'absent',
    color: '#c06060'
  },
  makeup: {
    label: 'Reposição Pendente',
    icon: 'pi pi-replay',
    class: 'makeup',
    color: '#d4a574'
  }
};

export interface AvulsoAttendance extends Attendance {
  patient_nome: string;
  profissional_id: number;
}

// ── Reposições pendentes ──────────────────────────────────────────────────

export interface PendingMakeup {
  id: string;         // serial4 / INTEGER no banco
  patient_id: string;
  patient_nome: string;
  date: Date;
  notes?: string;
}

export interface PendingMakeupsHttpResponse {
  data: PendingMakeup[];
  success: boolean;
}

export interface ResolveRepostoFormData {
  makeupId: string;
  presentPatientId: string;
  presentDate: string;
  existingAttendanceId?: number;
}

export interface ResolveRepostoResponse {
  makeup: Attendance;
  presence: Attendance;
}

export interface ResolveRepostoHttpResponse {
  data: ResolveRepostoResponse;
  success: boolean;
  message: string;
}