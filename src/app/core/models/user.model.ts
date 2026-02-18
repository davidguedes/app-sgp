export interface User {
  id: string;
  nome: string;
  email: string;
  role: 'gestor' | 'profissional';
  senha?: string;
}

export interface LoginCredentials {
  email: string;
  senha: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Professional {
  id: string;
  nome: string;
  total_alunos: number;
}

export interface ProfessionalsHttpResponse {
  data: Professional[];
  success: boolean;
}