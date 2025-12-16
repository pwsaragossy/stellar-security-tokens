
import { PasskeyKit } from 'passkey-kit';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export interface AuthResponse {
    success: boolean;
    data: {
        token: string;
        investor?: any;
        user?: any;
    };
}

export class PasskeyClient {
    private kit: PasskeyKit | null = null;
    private baseUrl: string;

    constructor() {
        this.baseUrl = API_URL;
    }

    /**
     * Initialize the PasskeyKit with config from backend
     */
    async init(): Promise<void> {
        if (this.kit) return;

        try {
            const response = await fetch(`${this.baseUrl}/auth/config`);
            if (!response.ok) throw new Error('Failed to fetch auth config');

            const config = await response.json();

            this.kit = new PasskeyKit({
                rpcUrl: config.rpcUrl,
                networkPassphrase: config.networkPassphrase,
                walletWasmHash: config.walletWasmHash,
            });
        } catch (error) {
            console.error('Failed to initialize PasskeyKit:', error);
            throw error;
        }
    }

    /**
     * Login with Passkey
     * Uses WebAuthn directly to prompt for passkey selection
     */
    async login(email: string, userType: 'investor' | 'company' = 'investor'): Promise<AuthResponse> {
        try {
            // 1. First, get the user's credential ID from the backend
            // The backend needs to tell us which credential to expect
            const configResponse = await fetch(`${this.baseUrl}/auth/passkey-login/challenge`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, userType }),
            });

            if (!configResponse.ok) {
                const errorData = await configResponse.json();
                throw new Error(errorData.error || 'Failed to get login challenge');
            }

            const { challenge, allowCredentials } = await configResponse.json();

            // 2. Trigger Browser WebAuthn Prompt
            const credential = await navigator.credentials.get({
                publicKey: {
                    challenge: Uint8Array.from(atob(challenge), c => c.charCodeAt(0)),
                    allowCredentials: allowCredentials?.map((cred: any) => ({
                        id: Uint8Array.from(atob(cred.id.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)),
                        type: 'public-key' as const,
                        transports: cred.transports || ['internal', 'hybrid'],
                    })),
                    timeout: 60000,
                    userVerification: 'preferred',
                },
            }) as PublicKeyCredential;

            if (!credential) {
                throw new Error('No passkey selected');
            }

            // Get credential ID as base64url
            const credentialIdBase64 = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)))
                .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

            // 3. Authenticate with Backend using the simple endpoint
            const response = await fetch(`${this.baseUrl}/auth/passkey-login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email,
                    credentialId: credentialIdBase64,
                    userType,
                }),
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Authentication failed');
            }

            return data;
        } catch (error: any) {
            console.error('Login error:', error);
            // Provide better error messages
            if (error.name === 'NotAllowedError') {
                throw new Error('Passkey authentication was cancelled or timed out');
            }
            throw error;
        }
    }

    /**
     * Register a new passkey and deploy smart wallet
     * Uses createWallet which handles both passkey creation AND wallet deployment
     */
    async register(username: string): Promise<{ credentialId: string; publicKey: string; contractId: string }> {
        await this.init();
        if (!this.kit) throw new Error('PasskeyKit not initialized');

        try {
            // createWallet creates the passkey AND deploys the smart wallet
            const result = await this.kit.createWallet('Stellar Tokens', username);

            if (!result || !result.keyIdBase64 || !result.contractId) {
                throw new Error('Failed to create wallet');
            }

            return {
                credentialId: result.keyIdBase64,
                publicKey: '', // Public key is embedded in the deployed contract
                contractId: result.contractId
            };
        } catch (error) {
            console.error('Registration error:', error);
            throw error;
        }
    }
}

export const passkeyClient = new PasskeyClient();
