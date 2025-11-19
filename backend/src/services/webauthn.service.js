import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import prisma from '../config/prisma.js';

const rpName = 'Stellar Security Tokens';
const rpID = process.env.WEBAUTHN_RP_ID || 'localhost';
const origin = process.env.WEBAUTHN_ORIGIN || `http://${rpID}:5173`;

/**
 * Serviço para gerenciar autenticação WebAuthn (passkeys)
 */
export class WebAuthnService {
  /**
   * Gera opções de registro para um usuário
   * @param {string} userType - Tipo de usuário: 'investor', 'company_user', 'platform_admin'
   * @param {number} userId - ID do usuário
   * @param {string} userName - Nome do usuário
   * @param {string} userEmail - Email do usuário
   * @returns {Promise<Object>} Opções de registro WebAuthn
   */
  static async generateRegistrationOptions(userType, userId, userName, userEmail) {
    const existingCredentials = await this.getUserCredentials(userType, userId);

    // Converter userId para Buffer (máximo 64 bytes)
    // O userID deve ser um identificador único do usuário
    const userIdBuffer = Buffer.from(userId.toString(), 'utf8');
    
    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: userIdBuffer,
      userName: userEmail,
      userDisplayName: userName,
      timeout: 60000,
      attestationType: 'none',
      excludeCredentials: existingCredentials.map(cred => ({
        id: Buffer.from(cred.credentialId, 'base64url'),
        type: 'public-key',
        transports: ['internal'],
      })),
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        requireResidentKey: false,
      },
      supportedAlgorithmIDs: [-7, -257],
    });

    return options;
  }

  /**
   * Verifica resposta de registro
   * @param {string} userType - Tipo de usuário
   * @param {number} userId - ID do usuário
   * @param {Object} registrationResponse - Resposta do cliente
   * @param {Object} expectedChallenge - Challenge esperado
   * @param {string} deviceName - Nome do dispositivo (opcional)
   * @returns {Promise<Object>} Resultado da verificação
   */
  static async verifyRegistration(userType, userId, registrationResponse, expectedChallenge, deviceName = null) {
    const verification = await verifyRegistrationResponse({
      response: registrationResponse,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });

    if (verification.verified && verification.registrationInfo) {
      const { credentialID, credentialPublicKey, counter } = verification.registrationInfo;

      // Converter credentialID para base64url string
      const credentialIdStr = Buffer.from(credentialID).toString('base64url');

      await this.saveCredential(
        userType,
        userId,
        credentialIdStr,
        Buffer.from(credentialPublicKey),
        counter,
        deviceName
      );
    }

    return verification;
  }

  /**
   * Gera opções de autenticação
   * @param {string} userType - Tipo de usuário
   * @param {number} userId - ID do usuário
   * @returns {Promise<Object>} Opções de autenticação WebAuthn
   */
  static async generateAuthenticationOptions(userType, userId) {
    const credentials = await this.getUserCredentials(userType, userId);

    if (credentials.length === 0) {
      throw new Error('No credentials found for user');
    }

    // Converter credential_id de string base64url para Buffer
    const options = await generateAuthenticationOptions({
      rpID,
      timeout: 60000,
      allowCredentials: credentials.map(cred => ({
        id: Buffer.from(cred.credentialId, 'base64url'),
        type: 'public-key',
        transports: ['internal'],
      })),
      userVerification: 'required',
    });

    return options;
  }

  /**
   * Verifica resposta de autenticação
   * @param {string} userType - Tipo de usuário
   * @param {number} userId - ID do usuário
   * @param {Object} authenticationResponse - Resposta do cliente
   * @param {string} expectedChallenge - Challenge esperado
   * @returns {Promise<Object>} Resultado da verificação
   */
  static async verifyAuthentication(userType, userId, authenticationResponse, expectedChallenge) {
    const credential = await this.getCredentialById(
      userType,
      Buffer.from(authenticationResponse.id, 'base64url').toString('base64url')
    );

    if (!credential) {
      throw new Error('Credential not found');
    }

    // Converter credential_id de string base64url para Buffer
    const credentialIdBuffer = Buffer.from(credential.credential_id, 'base64url');

    const verification = await verifyAuthenticationResponse({
      response: authenticationResponse,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: credentialIdBuffer,
        publicKey: Buffer.from(credential.publicKey),
        counter: credential.counter,
      },
      requireUserVerification: true,
    });

    if (verification.verified) {
      await this.updateCredentialCounter(
        userType,
        credential.credentialId,
        verification.authenticationInfo.newCounter
      );
      await this.updateCredentialLastUsed(userType, credential.credentialId);
    }

    return verification;
  }

  /**
   * Obtém credenciais de um usuário
   * @private
   */
  static async getUserCredentials(userType, userId) {
    const model = this.getPrismaModel(userType);
    const credentials = await prisma[model].findMany({
      where: { [this.getUserIdFieldName(userType)]: userId },
      select: {
        id: true,
        credentialId: true,
        publicKey: true,
        counter: true,
        deviceName: true,
        lastUsedAt: true,
      },
    });
    
    // Convert to legacy format for compatibility
    return credentials.map(cred => ({
      ...cred,
      credential_id: cred.credentialId,
      public_key: cred.publicKey,
      device_name: cred.deviceName,
      last_used_at: cred.lastUsedAt,
    }));
  }

  /**
   * Obtém credencial por ID
   * @private
   */
  static async getCredentialById(userType, credentialId) {
    const model = this.getPrismaModel(userType);
    const credential = await prisma[model].findUnique({
      where: { credentialId },
      select: {
        id: true,
        credentialId: true,
        publicKey: true,
        counter: true,
        deviceName: true,
      },
    });
    
    if (!credential) return null;
    
    // Convert to legacy format for compatibility
    return {
      ...credential,
      credential_id: credential.credentialId,
      public_key: credential.publicKey,
      device_name: credential.deviceName,
    };
  }

  /**
   * Salva uma nova credencial
   * @private
   */
  static async saveCredential(userType, userId, credentialId, publicKey, counter, deviceName) {
    const model = this.getPrismaModel(userType);
    const userIdField = this.getUserIdFieldName(userType);

    // Prisma doesn't support composite unique keys in upsert where clause directly
    // So we try to find first, then update or create
    const existing = await prisma[model].findFirst({
      where: {
        [userIdField]: userId,
        credentialId,
      },
    });

    if (existing) {
      await prisma[model].update({
        where: { id: existing.id },
        data: {
          publicKey,
          counter,
          deviceName: deviceName || existing.deviceName,
        },
      });
    } else {
      await prisma[model].create({
        data: {
          [userIdField]: userId,
          credentialId,
          publicKey,
          counter,
          deviceName: deviceName || null,
        },
      });
    }
  }

  /**
   * Atualiza contador de uma credencial
   * @private
   */
  static async updateCredentialCounter(userType, credentialId, newCounter) {
    const model = this.getPrismaModel(userType);
    await prisma[model].update({
      where: { credentialId },
      data: { counter: newCounter },
    });
  }

  /**
   * Atualiza última utilização de uma credencial
   * @private
   */
  static async updateCredentialLastUsed(userType, credentialId) {
    const model = this.getPrismaModel(userType);
    await prisma[model].update({
      where: { credentialId },
      data: { lastUsedAt: new Date() },
    });
  }

  /**
   * Obtém nome do modelo Prisma
   * @private
   */
  static getPrismaModel(userType) {
    const models = {
      investor: 'investorWebauthnCredential',
      company_user: 'companyUserWebauthnCredential',
      platform_admin: 'platformAdminWebauthnCredential',
    };
    return models[userType];
  }

  /**
   * Obtém nome do campo de ID do usuário no Prisma
   * @private
   */
  static getUserIdFieldName(userType) {
    const fields = {
      investor: 'investorId',
      company_user: 'companyUserId',
      platform_admin: 'platformAdminId',
    };
    return fields[userType];
  }


  /**
   * Obtém nome da tabela de credenciais (legacy, mantido para compatibilidade)
   * @private
   */
  static getCredentialsTableName(userType) {
    const tables = {
      investor: 'investor_webauthn_credentials',
      company_user: 'company_user_webauthn_credentials',
      platform_admin: 'platform_admin_webauthn_credentials',
    };
    return tables[userType];
  }

  /**
   * Obtém nome da coluna de ID do usuário (legacy, mantido para compatibilidade)
   * @private
   */
  static getUserIdColumnName(userType) {
    const columns = {
      investor: 'investor_id',
      company_user: 'company_user_id',
      platform_admin: 'platform_admin_id',
    };
    return columns[userType];
  }
}

