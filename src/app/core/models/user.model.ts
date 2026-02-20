export interface User {
  id: string;
  nome: string;
  email: string;
  role: 'gestor' | 'profissional';
  senha?: string;
  created_at?: Date;
}

export interface LoginCredentials {
  email: string;
  senha: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

// Usado no AuthService (select de pacientes)
export interface Professional {
  id: string;
  nome: string;
  total_alunos: number;
}

export interface ProfessionalsHttpResponse {
  data: Professional[];
  success: boolean;
}

// ─────────────────────────────────────────────
// Gerenciamento de profissionais (área de gestão)
// ─────────────────────────────────────────────

export interface ProfessionalDetail extends Professional {
  email: string;
  role: 'profissional';
  ganho_total: number;
  created_at: Date;
}

export interface ProfessionalFormData {
  nome: string;
  email: string;
  senha?: string;       // obrigatório na criação, opcional na edição
}

export interface ProfessionalHttpResponse {
  data: ProfessionalDetail;
  success: boolean;
}

export interface ProfessionalsDetailHttpResponse {
  data: ProfessionalDetail[];
  success: boolean;
}