export interface Attendance {
  id: string;
  patient_id: string;
  date: Date;
  status: 'present' | 'absent' | 'makeup';
  tipo?: 'regular' | 'avulso';   // novo campo — backend precisa da migration
  valor?: number;                 // novo campo — apenas para avulsas
  notes?: string;
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

// Payload para lançamento de aula avulsa (múltiplos alunos)
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
    label: 'Reposição',
    icon: 'pi pi-replay',
    class: 'makeup',
    color: '#d4a574'
  }
};

// Retorno do GET /attendance/avulso — já traz nome e profissional_id do JOIN
export interface AvulsoAttendance extends Attendance {
  patient_nome: string;
  profissional_id: number;
}