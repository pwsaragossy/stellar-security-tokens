
import { PasskeyKit } from 'passkey-kit';
import { authStorage } from '@/utils/authStorage';

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
                // Give 5 minutes for the passkey signing flow.
                // Default is 30 seconds which is too short when the flow includes
                // user passkey prompt + network round-trips + fee-bump wrapping.
                timeoutInSeconds: 300,
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
     * Uses createWallet which handles passkey creation, builds deployment tx, and signs it.
     * We then submit the signed tx to actually deploy on-chain.
     */
    async register(username: string): Promise<{ credentialId: string; contractId: string }> {
        await this.init();
        if (!this.kit) throw new Error('PasskeyKit not initialized');

        try {
            // createWallet creates the passkey, builds the deploy tx, and signs it
            // But it does NOT submit the transaction - we need to do that
            const result = await this.kit.createWallet('Stellar Tokens', username);

            if (!result || !result.keyIdBase64 || !result.contractId || !result.signedTx) {
                throw new Error('Failed to create wallet - missing required data');
            }

            console.log('[Passkey] Wallet created, submitting deployment transaction...');
            console.log('[Passkey] Contract ID:', result.contractId);

            // Submit the signed transaction to deploy the wallet on-chain
            // Convert the Tx to XDR string (base64)
            // @ts-ignore - toXDR may accept encoding parameter
            const xdrString = result.signedTx.toXDR('base64');

            console.log('[Passkey] XDR length:', xdrString?.length);

            // Submit via Launchtube endpoint (backend proxy)
            const submitResponse = await fetch(`${this.baseUrl}/wallets/submit-tx`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ xdr: xdrString }),
            });

            const submitResult = await submitResponse.json().catch(() => ({ success: false, error: 'Failed to parse response' }));

            if (!submitResponse.ok || !submitResult.success) {
                console.error('[Passkey] Transaction submission failed:', submitResult);
                throw new Error(`Wallet deployment failed: ${submitResult.error || 'Unknown error'}`);
            }

            console.log('[Passkey] Transaction submitted successfully:', submitResult);

            return {
                credentialId: result.keyIdBase64,
                contractId: result.contractId
            };
        } catch (error: any) {
            console.error('Registration error:', error);
            throw error;
        }
    }

    /**
     * Sign a transaction with the user's Passkey
     * @param xdr - The transaction XDR string to sign
     * @param walletContractId - Optional smart wallet contract ID (required for smart wallet signing)
     */
    async signTransaction(xdr: string, walletContractId?: string): Promise<string> {
        // 1. Check if we are in development and using a test account
        const isDev = import.meta.env.DEV || import.meta.env.VITE_ENABLE_TEST_LOGIN === 'true';

        // Check both investor and company user storage
        const user = authStorage.getUser<any>('investor') || authStorage.getUser<any>('company');
        const token = authStorage.getToken('investor') || authStorage.getToken('company');

        const isTestAccount = user?.stellarPublicKey?.startsWith('G');

        if (isDev && isTestAccount && token) {
            console.log('[Passkey] Test account detected, signing via backend...');
            try {
                const token = localStorage.getItem('token');
                const response = await fetch(`${this.baseUrl}/wallets/test-sign`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        xdr,
                        publicKey: user.stellarPublicKey
                    }),
                });

                const data = await response.json();
                if (!response.ok || !data.success) {
                    throw new Error(data.error || 'Backend test-signing failed');
                }

                return data.signedXdr;
            } catch (error) {
                console.error('[Passkey] Backend signing error:', error);
                throw error;
            }
        }

        // 2. Normal Passkey signing — requires wallet to be connected
        await this.init();
        if (!this.kit) throw new Error('PasskeyKit not initialized');

        // Connect wallet if not already connected — set it directly to avoid
        // triggering a WebAuthn discovery prompt (connectWallet calls startAuthentication)
        if (!this.kit.wallet) {
            const contractId = walletContractId || user?.stellarContractId;
            if (!contractId) {
                throw new Error('Smart wallet contract ID not found. Cannot sign transaction.');
            }
            console.log('[Passkey] Setting wallet for signing:', contractId);

            // Dynamically import the Client from passkey-kit-sdk to avoid
            // adding a top-level import for a peer dependency
            const { Client } = await import('passkey-kit-sdk');
            this.kit.wallet = new Client({
                contractId,
                networkPassphrase: this.kit.networkPassphrase,
                rpcUrl: this.kit.rpcUrl,
            });
        }

        try {
            // === DIAGNOSTIC: Trace the signing process ===
            const { TransactionBuilder } = await import('@stellar/stellar-sdk');
            const inputTx = TransactionBuilder.fromXDR(xdr, this.kit.networkPassphrase) as any;
            console.log('[Passkey] INPUT TX source:', inputTx.source);
            console.log('[Passkey] INPUT TX fee:', inputTx.fee);
            console.log('[Passkey] INPUT TX ops:', inputTx.operations?.length);
            const inputOp = inputTx.operations?.[0] as any;
            if (inputOp?.auth) {
                console.log('[Passkey] INPUT auth entries:', inputOp.auth.length);
                inputOp.auth.forEach((a: any, i: number) => {
                    console.log(`[Passkey] INPUT auth[${i}] address:`, a.credentials?.address?.address?.toString());
                    console.log(`[Passkey] INPUT auth[${i}] nonce:`, a.credentials?.address?.nonce?.toString());
                });
            }

            const signedTx = await this.kit.sign(xdr);

            // Log output TX details
            const outputXdr = signedTx.toXDR();
            const outputTx = TransactionBuilder.fromXDR(outputXdr as string, this.kit.networkPassphrase) as any;
            console.log('[Passkey] OUTPUT TX source:', outputTx.source);
            console.log('[Passkey] OUTPUT TX fee:', outputTx.fee);
            console.log('[Passkey] OUTPUT TX hash:', outputTx.hash().toString('hex'));
            const outputOp = outputTx.operations?.[0] as any;
            if (outputOp?.auth) {
                console.log('[Passkey] OUTPUT auth entries:', outputOp.auth.length);
                outputOp.auth.forEach((a: any, i: number) => {
                    console.log(`[Passkey] OUTPUT auth[${i}] address:`, a.credentials?.address?.address?.toString());
                    console.log(`[Passkey] OUTPUT auth[${i}] nonce:`, a.credentials?.address?.nonce?.toString());
                    console.log(`[Passkey] OUTPUT auth[${i}] sig type:`, a.credentials?.address?.signature?.switch?.()?.name);
                });
            }
            console.log('[Passkey] TX source changed?', inputTx.source !== outputTx.source);
            // === END DIAGNOSTIC ===

            return outputXdr as string;
        } catch (error: any) {
            console.error('Signing error:', error);
            throw error;
        }
    }
}

export const passkeyClient = new PasskeyClient();
