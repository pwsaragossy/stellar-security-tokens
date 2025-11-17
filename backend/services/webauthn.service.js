import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { query } from '../config/database.js';

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
        id: Buffer.from(cred.credential_id, 'base64url'),
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
        id: Buffer.from(cred.credential_id, 'base64url'),
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
        publicKey: Buffer.from(credential.public_key),
        counter: credential.counter,
      },
      requireUserVerification: true,
    });

    if (verification.verified) {
      await this.updateCredentialCounter(
        userType,
        credential.id,
        verification.authenticationInfo.newCounter
      );
      await this.updateCredentialLastUsed(userType, credential.id);
    }

    return verification;
  }

  /**
   * Obtém credenciais de um usuário
   * @private
   */
  static async getUserCredentials(userType, userId) {
    const tableName = this.getCredentialsTableName(userType);
    const userIdColumn = this.getUserIdColumnName(userType);

    const result = await query(
      `SELECT id, credential_id, public_key, counter, device_name, last_used_at
       FROM ${tableName}
       WHERE ${userIdColumn} = $1`,
      [userId]
    );

    return result.rows;
  }

  /**
   * Obtém credencial por ID
   * @private
   */
  static async getCredentialById(userType, credentialId) {
    const tableName = this.getCredentialsTableName(userType);

    const result = await query(
      `SELECT id, credential_id, public_key, counter, device_name
       FROM ${tableName}
       WHERE credential_id = $1`,
      [credentialId]
    );

    return result.rows[0] || null;
  }

  /**
   * Salva uma nova credencial
   * @private
   */
  static async saveCredential(userType, userId, credentialId, publicKey, counter, deviceName) {
    const tableName = this.getCredentialsTableName(userType);
    const userIdColumn = this.getUserIdColumnName(userType);

    await query(
      `INSERT INTO ${tableName} (${userIdColumn}, credential_id, public_key, counter, device_name, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (${userIdColumn}, credential_id) DO UPDATE
       SET public_key = EXCLUDED.public_key,
           counter = EXCLUDED.counter,
           device_name = COALESCE(EXCLUDED.device_name, ${tableName}.device_name)`,
      [userId, credentialId, publicKey, counter, deviceName]
    );
  }

  /**
   * Atualiza contador de uma credencial
   * @private
   */
  static async updateCredentialCounter(userType, credentialId, newCounter) {
    const tableName = this.getCredentialsTableName(userType);

    await query(
      `UPDATE ${tableName}
       SET counter = $1, updated_at = NOW()
       WHERE credential_id = $2`,
      [newCounter, credentialId]
    );
  }

  /**
   * Atualiza última utilização de uma credencial
   * @private
   */
  static async updateCredentialLastUsed(userType, credentialId) {
    const tableName = this.getCredentialsTableName(userType);

    await query(
      `UPDATE ${tableName}
       SET last_used_at = NOW()
       WHERE credential_id = $1`,
      [credentialId]
    );
  }

  /**
   * Obtém nome da tabela de credenciais
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
   * Obtém nome da coluna de ID do usuário
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

