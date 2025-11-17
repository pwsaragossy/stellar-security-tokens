import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import { api } from '@/api/client';

export type UserType = 'investor' | 'company_user' | 'platform_admin';

/**
 * Registra uma nova passkey para um usuário
 */
export async function registerPasskey(
  userType: UserType,
  email: string,
  userId?: number,
  deviceName?: string
): Promise<void> {
  try {
    // Iniciar registro
    const startResponse = await api.post(`/webauthn/${userType}/register/start`, {
      email,
      userId,
    });

    if (!startResponse.data.success || !startResponse.data.data) {
      throw new Error('Failed to start registration');
    }

    const options = startResponse.data.data;

    // Converter challenge e user.id para Uint8Array
    // O backend envia challenge e user.id como base64url strings
    const base64urlToUint8Array = (base64url: string): Uint8Array => {
      const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
      const padding = '='.repeat((4 - base64.length % 4) % 4);
      const binary = atob(base64 + padding);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    };

    const publicKeyCredentialCreationOptions = {
      ...options,
      challenge: base64urlToUint8Array(options.challenge),
      user: {
        ...options.user,
        id: base64urlToUint8Array(options.user.id),
      },
    };

    // Solicitar criação de credencial
    const credential = await startRegistration(publicKeyCredentialCreationOptions);

    // Converter credential para formato esperado pelo backend (base64url)
    const arrayBufferToBase64 = (buffer: ArrayBuffer | string): string => {
      // Se já for string (base64url), retornar como está
      if (typeof buffer === 'string') {
        return buffer;
      }
      // Se for ArrayBuffer, converter
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    };

    const credentialForBackend = {
      id: credential.id,
      rawId: arrayBufferToBase64(credential.rawId as ArrayBuffer | string),
      response: {
        attestationObject: arrayBufferToBase64(credential.response.attestationObject as ArrayBuffer | string),
        clientDataJSON: arrayBufferToBase64(credential.response.clientDataJSON as ArrayBuffer | string),
      },
      type: credential.type,
    };

    // Completar registro
    const completeResponse = await api.post(`/webauthn/${userType}/register/complete`, {
      credential: credentialForBackend,
      challenge: options.challenge,
      deviceName,
    });

    if (!completeResponse.data.success) {
      throw new Error(completeResponse.data.error || 'Failed to complete registration');
    }
  } catch (error: any) {
    if (error.name === 'NotAllowedError') {
      throw new Error('Registration cancelled or not supported');
    }
    throw error;
  }
}

/**
 * Autentica um usuário usando passkey
 */
export async function authenticateWithPasskey(
  userType: UserType,
  email: string
): Promise<{ token: string; user: any }> {
  try {
    // Iniciar autenticação
    const startResponse = await api.post(`/webauthn/${userType}/login/start`, {
      email,
    });

    if (!startResponse.data.success || !startResponse.data.data) {
      throw new Error('Failed to start authentication');
    }

    const options = startResponse.data.data;

    // Converter challenge e credential IDs para Uint8Array
    const base64urlToUint8Array = (base64url: string): Uint8Array => {
      const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
      const padding = '='.repeat((4 - base64.length % 4) % 4);
      const binary = atob(base64 + padding);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    };

    const publicKeyCredentialRequestOptions = {
      ...options,
      challenge: base64urlToUint8Array(options.challenge),
      allowCredentials: options.allowCredentials?.map((cred: any) => ({
        ...cred,
        id: base64urlToUint8Array(cred.id),
      })),
    };

    // Solicitar autenticação
    const credential = await startAuthentication(publicKeyCredentialRequestOptions);

    // Converter credential para formato esperado pelo backend (base64url)
    const arrayBufferToBase64 = (buffer: ArrayBuffer | string): string => {
      // Se já for string (base64url), retornar como está
      if (typeof buffer === 'string') {
        return buffer;
      }
      // Se for ArrayBuffer, converter
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    };

    const credentialForBackend = {
      id: credential.id,
      rawId: arrayBufferToBase64(credential.rawId as ArrayBuffer | string),
      response: {
        authenticatorData: arrayBufferToBase64(credential.response.authenticatorData as ArrayBuffer | string),
        clientDataJSON: arrayBufferToBase64(credential.response.clientDataJSON as ArrayBuffer | string),
        signature: arrayBufferToBase64(credential.response.signature as ArrayBuffer | string),
        userHandle: credential.response.userHandle
          ? arrayBufferToBase64(credential.response.userHandle as ArrayBuffer | string)
          : null,
      },
      type: credential.type,
    };

    // Completar autenticação
    const completeResponse = await api.post(`/webauthn/${userType}/login/complete`, {
      credential: credentialForBackend,
      challenge: options.challenge,
    });

    if (!completeResponse.data.success || !completeResponse.data.data) {
      throw new Error(completeResponse.data.error || 'Authentication failed');
    }

    return {
      token: completeResponse.data.data.token,
      user: completeResponse.data.data,
    };
  } catch (error: any) {
    if (error.name === 'NotAllowedError') {
      throw new Error('Authentication cancelled or not supported');
    }
    throw error;
  }
}

/**
 * Verifica se WebAuthn é suportado no navegador
 */
export function isWebAuthnSupported(): boolean {
  return typeof window !== 'undefined' && 
         'PublicKeyCredential' in window &&
         typeof PublicKeyCredential !== 'undefined';
}

