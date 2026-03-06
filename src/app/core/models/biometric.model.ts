export interface BiometricCredential {
  id: string;
  patient_id: string;
  credential_id: string;
  device_name: string;
  created_at: Date;
  last_used_at?: Date;
}

// Resposta do begin registration — são as opções passadas para
// navigator.credentials.create({ publicKey: options })
export interface RegistrationOptionsResponse {
  success: boolean;
  data: {
    options: PublicKeyCredentialCreationOptionsJSON;
    deviceName?: string;
  };
}

// Resposta do begin authentication — são as opções passadas para
// navigator.credentials.get({ publicKey: options })
export interface AuthenticationOptionsResponse {
  success: boolean;
  data: PublicKeyCredentialRequestOptionsJSON;
}

export interface BiometricCredentialsResponse {
  success: boolean;
  data: BiometricCredential[];
}

// ─── Tipos auxiliares WebAuthn ─────────────────────────────────────────────
// O browser expõe esses tipos nativamente, mas é útil tê-los explícitos
// para comunicação com a API.

export interface PublicKeyCredentialCreationOptionsJSON {
  rp:                     { name: string; id: string };
  user:                   { id: string; name: string; displayName: string };
  challenge:              string;
  pubKeyCredParams:       { alg: number; type: string }[];
  timeout?:               number;
  excludeCredentials?:    { id: string; type: string; transports?: string[] }[];
  authenticatorSelection?: {
    authenticatorAttachment?: string;
    userVerification?:        string;
    residentKey?:             string;
  };
}

export interface PublicKeyCredentialRequestOptionsJSON {
  challenge:         string;
  timeout?:          number;
  rpId?:             string;
  allowCredentials?: { id: string; type: string; transports?: string[] }[];
  userVerification?: string;
}