export interface Attendance {
  id: string;
  date: Date;
  status: 'present' | 'absent' | 'makeup';
  notes?: string;
  createdAt?: Date;
}

export interface AttendanceHttpResponse {
  data: Attendance[];
  success: boolean;
}

export interface AttendanceFormData {
  date: Date;
  status: 'present' | 'absent' | 'makeup';
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