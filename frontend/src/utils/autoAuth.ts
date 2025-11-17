import { authenticateWithPasskey, registerPasskey } from './webauthn';
import { isWebAuthnSupported } from './webauthn';
import { investorsApi } from '@/api/investors';
import { companiesApi } from '@/api/companies';
import { companyUsersApi } from '@/api/companyUsers';
import { platformAdminsApi } from '@/api/platformAdmins';
import { getInvestorDebugData, getCompanyDebugData, getCompanyUserDebugData } from './debugData';
import type { UserType } from './webauthn';

/**
 * Email mock padrão para cada tipo de usuário (para debug)
 */
const MOCK_EMAILS = {
  investor: 'investor@debug.local',
  company_user: 'company@debug.local',
  platform_admin: 'admin@debug.local',
};

/**
 * Autenticação automática com criação de conta mock se necessário
 */
export async function autoAuthWithMock(userType: UserType): Promise<{ token: string; user: any }> {
  if (!isWebAuthnSupported()) {
    throw new Error('Passkey authentication is not supported in this browser');
  }

  const mockEmail = MOCK_EMAILS[userType];

  try {
    // Tentar autenticar primeiro
    try {
      const result = await authenticateWithPasskey(userType, mockEmail);
      return result;
    } catch (authError: any) {
      // Se falhar (usuário não existe ou não tem passkey), criar conta mock
      console.log(`[DEBUG] User not found or no passkey for ${mockEmail}, creating mock account...`);
      
      let userId: number;
      
      if (userType === 'investor') {
        // Criar investidor mock
        const debugData = getInvestorDebugData();
        console.log(`[DEBUG] Creating investor with email: ${mockEmail}`);
        const registerResponse = await investorsApi.register({
          name: debugData.name,
          email: mockEmail,
          document: debugData.document.replace(/\D/g, ''),
          password: debugData.password,
        });
        
        if (!registerResponse.success || !registerResponse.data) {
          throw new Error(`Failed to create mock investor: ${registerResponse.error || 'Unknown error'}`);
        }
        
        userId = registerResponse.data.id;
        console.log(`[DEBUG] Investor created with ID: ${userId}`);
      } else if (userType === 'company_user') {
        // Criar empresa mock primeiro
        const companyDebugData = getCompanyDebugData();
        const companyEmail = `company-${Date.now()}@debug.local`;
        console.log(`[DEBUG] Creating company with email: ${companyEmail}`);
        
        const companyResponse = await companiesApi.register({
          name: companyDebugData.name,
          cnpj: companyDebugData.cnpj.replace(/\D/g, ''),
          email: companyEmail,
          legal_representative: companyDebugData.legal_representative,
          address: companyDebugData.address,
          phone: companyDebugData.phone.replace(/\D/g, ''),
        });
        
        if (!companyResponse.success || !companyResponse.data) {
          throw new Error(`Failed to create mock company: ${companyResponse.error || 'Unknown error'}`);
        }
        
        console.log(`[DEBUG] Company created with ID: ${companyResponse.data.id}`);
        
        // Criar usuário da empresa mock
        const userDebugData = getCompanyUserDebugData();
        console.log(`[DEBUG] Creating company user with email: ${mockEmail}`);
        
        const userResponse = await companyUsersApi.register({
          company_id: companyResponse.data.id,
          email: mockEmail,
          name: userDebugData.name,
          password: userDebugData.password,
          role: userDebugData.role,
        });
        
        if (!userResponse.success || !userResponse.data) {
          throw new Error(`Failed to create mock company user: ${userResponse.error || 'Unknown error'}`);
        }
        
        userId = userResponse.data.id;
        console.log(`[DEBUG] Company user created with ID: ${userId}`);
      } else {
        // Criar platform admin mock
        console.log(`[DEBUG] Creating platform admin with email: ${mockEmail}`);
        const adminResponse = await platformAdminsApi.create({
          email: mockEmail,
          name: 'Debug Admin',
          password: 'Test123456',
          role: 'super_admin',
        });
        
        if (!adminResponse.success || !adminResponse.data) {
          // Tentar endpoint de debug se o endpoint normal falhar
          try {
            const { api } = await import('@/api/client');
            const debugResponse = await api.post('/platform-admins/debug/create', {
              email: mockEmail,
              name: 'Debug Admin',
              password: 'Test123456',
              role: 'super_admin',
            });
            
            if (!debugResponse.data.success || !debugResponse.data.data) {
              throw new Error(`Failed to create mock admin: ${debugResponse.data.error || 'Unknown error'}`);
            }
            
            userId = debugResponse.data.data.id;
            console.log(`[DEBUG] Platform admin created via debug endpoint with ID: ${userId}`);
          } catch (debugError: any) {
            throw new Error(`Failed to create mock admin: ${adminResponse.error || debugError.message || 'Unknown error'}`);
          }
        } else {
          userId = adminResponse.data.id;
          console.log(`[DEBUG] Platform admin created with ID: ${userId}`);
        }
      }
      
      // Registrar passkey automaticamente
      console.log(`[DEBUG] Registering passkey for user ID: ${userId}`);
      await registerPasskey(userType, mockEmail, userId, 'Auto Device');
      console.log(`[DEBUG] Passkey registered successfully`);
      
      // Tentar autenticar novamente
      console.log(`[DEBUG] Attempting authentication with passkey...`);
      const result = await authenticateWithPasskey(userType, mockEmail);
      console.log(`[DEBUG] Authentication successful`);
      return result;
    }
  } catch (error: any) {
    console.error(`[DEBUG] Auto auth error:`, error);
    throw new Error(`Auto auth failed: ${error.message}`);
  }
}

export { isWebAuthnSupported };

