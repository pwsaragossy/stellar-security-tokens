import { api } from '@/api/client';

/**
 * Login direto com dados mock fixos (sem passkey, sem senha, sem complexidade)
 * Apenas chama endpoint de debug que retorna token + dados diretamente
 */
export async function devLoginMock(userType: 'investor' | 'company_user' | 'platform_admin'): Promise<{ token: string; user: any }> {
  try {
    const typeMap = {
      investor: 'investor',
      company_user: 'company',
      platform_admin: 'admin',
    };

    const endpoint = `/dev/login/${typeMap[userType]}`;
    
    const response = await api.post(endpoint);
    
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Login failed');
    }

    return {
      token: response.data.data.token,
      user: response.data.data,
    };
  } catch (error: any) {
    console.error(`[DEV] Dev login error:`, error);
    throw new Error(`Dev login failed: ${error.response?.data?.error || error.message || 'Unknown error'}`);
  }
}
