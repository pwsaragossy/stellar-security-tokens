import { WebAuthnService } from './services/webauthn.service.js';
import { Investor } from './models/Investor.js';
import { Company } from './models/Company.js';
import { CompanyUser } from './models/CompanyUser.js';
import { PlatformAdmin } from './models/PlatformAdmin.js';
import { generateToken } from './middleware/auth.js';

// Armazenar challenges temporariamente (em produção, usar Redis)
const challenges = new Map();

/**
 * Controller para autenticação WebAuthn (passkeys)
 */
export class WebAuthnController {
  /**
   * Gera opções de registro para um usuário
   * POST /api/webauthn/:userType/register/start
   */
  static async startRegistration(req, res, next) {
    try {
      const { userType } = req.params;
      const { email, userId } = req.body;

      if (!email && !userId) {
        return res.status(400).json({
          success: false,
          error: 'Email or userId is required',
        });
      }

      let user;
      let userModel;

      // Buscar usuário por email ou ID
      if (userId) {
        switch (userType) {
          case 'investor':
            user = await Investor.findById(parseInt(userId));
            userModel = Investor;
            break;
          case 'company_user':
            user = await CompanyUser.findById(parseInt(userId));
            userModel = CompanyUser;
            break;
          case 'platform_admin':
            user = await PlatformAdmin.findById(parseInt(userId));
            userModel = PlatformAdmin;
            break;
          default:
            return res.status(400).json({
              success: false,
              error: 'Invalid user type',
            });
        }
      } else {
        switch (userType) {
          case 'investor':
            user = await Investor.findByEmail(email);
            userModel = Investor;
            break;
          case 'company_user':
            user = await CompanyUser.findByEmail(email);
            userModel = CompanyUser;
            break;
          case 'platform_admin':
            user = await PlatformAdmin.findByEmail(email);
            userModel = PlatformAdmin;
            break;
          default:
            return res.status(400).json({
              success: false,
              error: 'Invalid user type',
            });
        }
      }

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
        });
      }

      const userName = user.name || user.email;
      const userEmail = user.email;

      const options = await WebAuthnService.generateRegistrationOptions(
        userType,
        user.id,
        userName,
        userEmail
      );

      // Armazenar challenge temporariamente (expira em 5 minutos)
      const challengeKey = `${userType}:${user.id}:${options.challenge}`;
      challenges.set(challengeKey, {
        challenge: options.challenge,
        userId: user.id,
        userType,
        expiresAt: Date.now() + 5 * 60 * 1000,
      });

      res.json({
        success: true,
        data: options,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Verifica resposta de registro
   * POST /api/webauthn/:userType/register/complete
   */
  static async completeRegistration(req, res, next) {
    try {
      const { userType } = req.params;
      const { credential, challenge, deviceName } = req.body;

      if (!credential || !challenge) {
        return res.status(400).json({
          success: false,
          error: 'Credential and challenge are required',
        });
      }

      // Buscar challenge armazenado
      const challengeKey = Object.keys(challenges).find(key => {
        const stored = challenges.get(key);
        return stored && stored.challenge === challenge && stored.userType === userType;
      });

      if (!challengeKey) {
        return res.status(400).json({
          success: false,
          error: 'Invalid or expired challenge',
        });
      }

      const stored = challenges.get(challengeKey);
      
      if (Date.now() > stored.expiresAt) {
        challenges.delete(challengeKey);
        return res.status(400).json({
          success: false,
          error: 'Challenge expired',
        });
      }

      // Converter credential do formato base64url para o formato esperado pela biblioteca
      const base64urlToBuffer = (base64url) => {
        const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
        const padding = '='.repeat((4 - base64.length % 4) % 4);
        return Buffer.from(base64 + padding, 'base64');
      };

      const credentialForVerification = {
        ...credential,
        rawId: base64urlToBuffer(credential.rawId),
        response: {
          ...credential.response,
          attestationObject: base64urlToBuffer(credential.response.attestationObject),
          clientDataJSON: base64urlToBuffer(credential.response.clientDataJSON),
        },
      };

      const verification = await WebAuthnService.verifyRegistration(
        userType,
        stored.userId,
        credentialForVerification,
        challenge,
        deviceName
      );

      challenges.delete(challengeKey);

      if (!verification.verified) {
        return res.status(400).json({
          success: false,
          error: 'Registration verification failed',
        });
      }

      res.json({
        success: true,
        message: 'Passkey registered successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Gera opções de autenticação
   * POST /api/webauthn/:userType/login/start
   */
  static async startAuthentication(req, res, next) {
    try {
      const { userType } = req.params;
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          error: 'Email is required',
        });
      }

      let user;

      switch (userType) {
        case 'investor':
          user = await Investor.findByEmail(email);
          break;
        case 'company_user':
          user = await CompanyUser.findByEmail(email);
          break;
        case 'platform_admin':
          user = await PlatformAdmin.findByEmail(email);
          break;
        default:
          return res.status(400).json({
            success: false,
            error: 'Invalid user type',
          });
      }

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
        });
      }

      const options = await WebAuthnService.generateAuthenticationOptions(userType, user.id);

      // Armazenar challenge temporariamente
      const challengeKey = `${userType}:${user.id}:${options.challenge}`;
      challenges.set(challengeKey, {
        challenge: options.challenge,
        userId: user.id,
        userType,
        email: user.email,
        expiresAt: Date.now() + 5 * 60 * 1000,
      });

      res.json({
        success: true,
        data: options,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Verifica resposta de autenticação e retorna token JWT
   * POST /api/webauthn/:userType/login/complete
   */
  static async completeAuthentication(req, res, next) {
    try {
      const { userType } = req.params;
      const { credential, challenge } = req.body;

      if (!credential || !challenge) {
        return res.status(400).json({
          success: false,
          error: 'Credential and challenge are required',
        });
      }

      // Buscar challenge armazenado
      const challengeKey = Object.keys(challenges).find(key => {
        const stored = challenges.get(key);
        return stored && stored.challenge === challenge && stored.userType === userType;
      });

      if (!challengeKey) {
        return res.status(400).json({
          success: false,
          error: 'Invalid or expired challenge',
        });
      }

      const stored = challenges.get(challengeKey);
      
      if (Date.now() > stored.expiresAt) {
        challenges.delete(challengeKey);
        return res.status(400).json({
          success: false,
          error: 'Challenge expired',
        });
      }

      // Converter credential do formato base64url para o formato esperado pela biblioteca
      const base64urlToBuffer = (base64url) => {
        const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
        const padding = '='.repeat((4 - base64.length % 4) % 4);
        return Buffer.from(base64 + padding, 'base64');
      };

      const credentialForVerification = {
        ...credential,
        rawId: base64urlToBuffer(credential.rawId),
        response: {
          ...credential.response,
          authenticatorData: base64urlToBuffer(credential.response.authenticatorData),
          clientDataJSON: base64urlToBuffer(credential.response.clientDataJSON),
          signature: base64urlToBuffer(credential.response.signature),
          userHandle: credential.response.userHandle ? base64urlToBuffer(credential.response.userHandle) : null,
        },
      };

      const verification = await WebAuthnService.verifyAuthentication(
        userType,
        stored.userId,
        credentialForVerification,
        challenge
      );

      challenges.delete(challengeKey);

      if (!verification.verified) {
        return res.status(401).json({
          success: false,
          error: 'Authentication verification failed',
        });
      }

      // Buscar dados completos do usuário
      let user;
      switch (userType) {
        case 'investor':
          user = await Investor.findById(stored.userId);
          break;
        case 'company_user':
          user = await CompanyUser.findById(stored.userId);
          break;
        case 'platform_admin':
          user = await PlatformAdmin.findById(stored.userId);
          break;
      }

      if (!user || (userType === 'platform_admin' && !user.is_active)) {
        return res.status(401).json({
          success: false,
          error: 'User not found or inactive',
        });
      }

      // Gerar token JWT
      const token = generateToken({
        id: user.id,
        email: user.email,
        role: userType === 'investor' ? 'investor' : userType === 'company_user' ? 'company' : 'platform_admin',
      });

      // Preparar resposta baseada no tipo de usuário
      let userData;
      if (userType === 'investor') {
        userData = {
          investor: {
            id: user.id,
            name: user.name,
            email: user.email,
            document: user.document || '',
            kycStatus: user.kycStatus,
            created_at: user.created_at,
            updated_at: user.updated_at,
          },
        };
      } else if (userType === 'company_user') {
        // Buscar dados completos da empresa
        const company = await Company.findById(user.company_id);
        
        userData = {
          company: {
            id: company?.id || user.company_id,
            name: company?.name || '',
            cnpj: company?.cnpj || '',
            email: company?.email || user.email,
            legal_representative: company?.legal_representative || '',
            address: company?.address || '',
            phone: company?.phone || '',
            status: company?.status || 'pending',
            kycStatus: company?.kycStatus || 'pending',
            kyc_documents: company?.kyc_documents || {},
            created_at: company?.created_at || new Date().toISOString(),
            updated_at: company?.updated_at || new Date().toISOString(),
          },
        };
      } else {
        userData = {
          admin: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            is_active: user.is_active !== undefined ? user.is_active : true,
            created_at: user.created_at,
            updated_at: user.updated_at,
          },
        };
      }

      res.json({
        success: true,
        data: {
          token,
          ...userData,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

