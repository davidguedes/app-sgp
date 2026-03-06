// services/biometric.service.ts
//
// Este service encapsula TODA a lógica WebAuthn do lado do cliente:
//   1. Verifica suporte do browser
//   2. Faz as chamadas begin/complete ao backend
//   3. Converte os formatos binários (ArrayBuffer ↔ base64url)
//      que o browser usa internamente mas a API trafega como string
//
// O padrão base64url é diferente do base64 padrão:
//   - Usa '-' em vez de '+' e '_' em vez de '/'
//   - Sem padding '='
// Isso é exigido pelo protocolo WebAuthn.

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, switchMap, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  BiometricCredential,
  BiometricCredentialsResponse,
  RegistrationOptionsResponse,
  AuthenticationOptionsResponse,
} from '../models/biometric.model';
import { Attendance } from '../models/attendance.model';

@Injectable({ providedIn: 'root' })
export class BiometricService {
  private readonly API = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // ─── Verificação de suporte ──────────────────────────────────────────────

  /**
   * Verifica se o browser e o dispositivo suportam WebAuthn com biometria.
   * Deve ser chamado antes de exibir qualquer botão biométrico.
   */
  async isSupported(): Promise<boolean> {
    if (!window.PublicKeyCredential) return false;
    try {
      // isUserVerifyingPlatformAuthenticatorAvailable = Touch ID, Face ID, Windows Hello etc.
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
      return false;
    }
  }

  // ─── REGISTRO ────────────────────────────────────────────────────────────

  /**
   * Fluxo completo de cadastro biométrico.
   * Uso:
   *   this.biometricService.register(patientId, 'iPhone de João').subscribe(...)
   */
  register(patientId: string, deviceName: string): Observable<{ success: boolean; message: string }> {
    // 1. Pede as opções ao backend
    return this.http.post<RegistrationOptionsResponse>(
      `${this.API}/biometric/register/begin`,
      { patientId, deviceName }
    ).pipe(
      // 2. Aciona o autenticador do dispositivo (abre o Touch ID / Face ID)
      switchMap(({ data }) => from(this._createCredential(data.options))),
      // 3. Envia a resposta do autenticador para o backend validar e salvar
      switchMap(credential => this.http.post<{ success: boolean; message: string }>(
        `${this.API}/biometric/register/complete`,
        { patientId, deviceName, credential }
      ))
    );
  }

  // ─── AUTENTICAÇÃO ────────────────────────────────────────────────────────

  /**
   * Fluxo completo de autenticação biométrica → marca presença.
   * Retorna o registro de attendance criado.
   * Uso:
   *   this.biometricService.authenticateAndMarkAttendance(patientId).subscribe(...)
   */
  authenticateAndMarkAttendance(
    patientId: string,
    date?: string
  ): Observable<{ success: boolean; message: string; data: Attendance }> {
    // 1. Pede o challenge ao backend
    return this.http.post<AuthenticationOptionsResponse>(
      `${this.API}/biometric/auth/begin`,
      { patientId }
    ).pipe(
      // 2. Aciona o autenticador (Touch ID / Face ID)
      switchMap(({ data }) => from(this._getAssertion(data))),
      // 3. Envia a assinatura biométrica + data para o backend validar e marcar presença
      switchMap(credential => this.http.post<{ success: boolean; message: string; data: Attendance }>(
        `${this.API}/biometric/auth/complete`,
        { patientId, credential, date }
      ))
    );
  }

  // ─── GESTÃO ──────────────────────────────────────────────────────────────

  listCredentials(patientId: string): Observable<BiometricCredential[]> {
    return this.http.get<BiometricCredentialsResponse>(
      `${this.API}/biometric/${patientId}`
    ).pipe(map(r => r.data));
  }

  deleteCredential(patientId: string, credentialId: string): Observable<void> {
    return this.http.delete<void>(
      `${this.API}/biometric/${patientId}/${credentialId}`
    );
  }

  // ─── Helpers privados: conversão de formatos ─────────────────────────────

  /**
   * Aciona navigator.credentials.create() com as opções do backend.
   * As opções chegam como strings base64url, mas o browser precisa de ArrayBuffer.
   * Retornamos um objeto serializável (string) para enviar de volta à API.
   */
  private async _createCredential(options: any): Promise<any> {
    const publicKey: PublicKeyCredentialCreationOptions = {
      ...options,
      // Converte challenge de base64url → ArrayBuffer
      challenge: this._base64urlToBuffer(options.challenge),
      user: {
        ...options.user,
        id: this._base64urlToBuffer(options.user.id),
      },
      excludeCredentials: (options.excludeCredentials || []).map((c: any) => ({
        ...c,
        id: this._base64urlToBuffer(c.id),
      })),
    };

    const credential = await navigator.credentials.create({ publicKey }) as PublicKeyCredential;
    if (!credential) throw new Error('Criação de credencial cancelada pelo usuário');

    const response = credential.response as AuthenticatorAttestationResponse;

    // Serializa para enviar via HTTP (ArrayBuffer → base64url)
    return {
      id:    credential.id,
      rawId: this._bufferToBase64url(credential.rawId),
      type:  credential.type,
      response: {
        clientDataJSON:    this._bufferToBase64url(response.clientDataJSON),
        attestationObject: this._bufferToBase64url(response.attestationObject),
      },
    };
  }

  /**
   * Aciona navigator.credentials.get() para autenticação.
   */
  private async _getAssertion(options: any): Promise<any> {
    const publicKey: PublicKeyCredentialRequestOptions = {
      ...options,
      challenge: this._base64urlToBuffer(options.challenge),
      allowCredentials: (options.allowCredentials || []).map((c: any) => ({
        ...c,
        id: this._base64urlToBuffer(c.id),
      })),
    };

    const assertion = await navigator.credentials.get({ publicKey }) as PublicKeyCredential;
    if (!assertion) throw new Error('Autenticação cancelada pelo usuário');

    const response = assertion.response as AuthenticatorAssertionResponse;

    return {
      id:    assertion.id,
      rawId: this._bufferToBase64url(assertion.rawId),
      type:  assertion.type,
      response: {
        clientDataJSON:    this._bufferToBase64url(response.clientDataJSON),
        authenticatorData: this._bufferToBase64url(response.authenticatorData),
        signature:         this._bufferToBase64url(response.signature),
        userHandle:        response.userHandle ? this._bufferToBase64url(response.userHandle) : null,
      },
    };
  }

  /** ArrayBuffer → string base64url (sem padding '=') */
  private _bufferToBase64url(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let str = '';
    bytes.forEach(b => str += String.fromCharCode(b));
    return btoa(str)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /** string base64url → ArrayBuffer */
  private _base64urlToBuffer(base64url: string): ArrayBuffer {
    // Normaliza de volta para base64 padrão
    const base64 = base64url
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(base64url.length + (4 - base64url.length % 4) % 4, '=');
    const binary = atob(base64);
    const buffer = new ArrayBuffer(binary.length);
    const bytes  = new Uint8Array(buffer);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return buffer;
  }

  // ─── CHECK-IN DISCOVERABLE ("modo academia") ─────────────────────────────

  /**
   * Fluxo de check-in sem patientId conhecido.
   * allowCredentials vazio → o autenticador exibe as credenciais disponíveis
   * e o aluno autentica. O backend identifica quem é, verifica a aula e
   * marca presença (ou retorna hasClass: false para o professor decidir).
   */
  checkin(date?: string): Observable<any> {
    return this.http.post<any>(`${this.API}/biometric/checkin/begin`, {}).pipe(
      switchMap(({ data }) => from(this._getAssertion(data))),
      switchMap(credential => this.http.post<any>(
        `${this.API}/biometric/checkin/complete`,
        { credential, date }
      ))
    );
  }
}