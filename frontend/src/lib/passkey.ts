
import { PasskeyKit } from 'passkey-kit';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export interface AuthResponse {
    success: boolean;
    message?: string;
    data: {
        token: string;
        investor?: any;
        user?: any;
        userType?: 'investor' | 'company';
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
     * Login with Passkey (Usernameless / Discoverable Credentials)
     * No email required - browser shows all available passkeys for this site
     */
    async discoverLogin(): Promise<AuthResponse> {
        try {
            // 1. Get challenge from backend
            const challengeResponse = await fetch(`${this.baseUrl}/auth/passkey-login/discover`);

            if (!challengeResponse.ok) {
                throw new Error('Failed to get login challenge');
            }

            const { challenge } = await challengeResponse.json();

            // 2. Trigger WebAuthn with empty allowCredentials
            // This prompts the browser to show all discoverable credentials for this RP
            const credential = await navigator.credentials.get({
                publicKey: {
                    challenge: Uint8Array.from(atob(challenge), c => c.charCodeAt(0)),
                    allowCredentials: [], // Empty = show all discoverable credentials
                    timeout: 60000,
                    userVerification: 'required',
                },
            }) as PublicKeyCredential;

            if (!credential) {
                throw new Error('No passkey selected');
            }

            // Get credential ID as base64url
            const credentialIdBase64 = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)))
                .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

            // 3. Authenticate with Backend using discover endpoint
            // Backend looks up user by credentialId
            const authResponse = await fetch(`${this.baseUrl}/auth/passkey-login/discover`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    credentialId: credentialIdBase64,
                }),
            });

            const data = await authResponse.json();

            if (!authResponse.ok || !data.success) {
                throw new Error(data.error || 'Authentication failed');
            }

            return data;
        } catch (error: any) {
            console.error('Discover login error:', error);
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

    /**
     * Sign a transaction with the user's Passkey
     */
    async signTransaction(xdr: string): Promise<string> {
        await this.init();
        if (!this.kit) throw new Error('PasskeyKit not initialized');

        try {
            const signedTx = await this.kit.sign(xdr);
            return signedTx.toXDR();
        } catch (error) {
            console.error('Signing error:', error);
            throw error;
        }
    }
}

export const passkeyClient = new PasskeyClient();
