
import { SmartAccountKit } from 'smart-account-kit';


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

const CRED_STORAGE_KEY = 'radox_passkey_credential';

function bytesToBase64(bytes: Uint8Array): string {
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
}

export class PasskeyClient {
    private kit: SmartAccountKit | null = null;
    private baseUrl: string;
    /** Deduplicates concurrent init() calls — critical for Chrome activation window */
    private initPromise: Promise<void> | null = null;

    constructor() {
        this.baseUrl = API_URL;
    }

    /** Persist credential across page refreshes (sessionStorage = tab-scoped) */
    private get lastCredentialId(): string | null {
        try { return sessionStorage.getItem(CRED_STORAGE_KEY); }
        catch { return null; }
    }
    private set lastCredentialId(value: string | null) {
        try {
            if (value) sessionStorage.setItem(CRED_STORAGE_KEY, value);
            else sessionStorage.removeItem(CRED_STORAGE_KEY);
        } catch { /* private browsing */ }
    }

    /**
     * Reset all cached state — call on logout/disconnect.
     * Without this, switching accounts leaves the old passkey
     * credential in memory → __check_auth fails on the new wallet.
     */
    reset(): void {
        this.lastCredentialId = null;
        this.kit = null;
        this.initPromise = null;
    }

    /**
     * Initialize the SmartAccountKit with config from backend.
     * Uses promise deduplication so pre-warming via useEffect and
     * the button-click call share one fetch — preserving Chrome's
     * transient activation window for navigator.credentials.create().
     */
    async init(): Promise<void> {
        if (this.kit) return;
        if (this.initPromise) return this.initPromise;
        this.initPromise = this._doInit();
        return this.initPromise;
    }

    private async _doInit(): Promise<void> {
        try {
            const response = await fetch(`${this.baseUrl}/auth/config`);
            if (!response.ok) throw new Error('Failed to fetch auth config');

            const config = await response.json();

            // CRITICAL: Override startAuthentication to force userVerification: "required".
            // The OZ smart-account-kit hardcodes "preferred" in signAuthEntry(),
            // which lets Safari skip biometric → UV bit = 0 → on-chain verifier
            // rejects with Error(Contract, #3117) = VerifiedBitNotSet.
            const { startRegistration, startAuthentication } = await import('@simplewebauthn/browser');

            // CRITICAL: Force platform authenticator during registration.
            // The SDK generates its own options internally and may not include
            // authenticatorAttachment: 'platform', causing iOS/Android to show
            // the cross-device QR code / security key modal. We intercept here
            // and inject the correct selection before the WebAuthn call fires.
            const wrappedStartRegistration: typeof startRegistration = (opts) => {
                if (opts.optionsJSON) {
                    opts.optionsJSON.authenticatorSelection = {
                        ...opts.optionsJSON.authenticatorSelection,
                        authenticatorAttachment: 'platform',
                        residentKey: 'required',
                        userVerification: 'required',
                    };
                }
                return startRegistration(opts);
            };

            // CRITICAL: Override startAuthentication to force userVerification: "required".
            // The OZ smart-account-kit hardcodes "preferred" in signAuthEntry(),
            // which lets Safari skip biometric → UV bit = 0 → on-chain verifier
            // rejects with Error(Contract, #3117) = VerifiedBitNotSet.
            const wrappedStartAuthentication: typeof startAuthentication = (opts) => {
                if (opts.optionsJSON) {
                    opts.optionsJSON.userVerification = 'required';
                }
                return startAuthentication(opts);
            };

            this.kit = new SmartAccountKit({
                rpcUrl: config.rpcUrl,
                networkPassphrase: config.networkPassphrase,
                accountWasmHash: config.accountWasmHash,
                webauthnVerifierAddress: config.webauthnVerifierAddress,
                // CRITICAL: rpId tells the browser which domain scope to use.
                // Without it, rp.id is undefined and the browser guesses from
                // hostname — causing some devices to show the QR code modal
                // instead of Face ID / Touch ID.
                rpId: config.rpId,
                // Use backend as relay proxy for fee-sponsored submissions
                relayerUrl: `${this.baseUrl}/wallets/relay`,
                // Give 5 minutes for the passkey signing flow.
                timeoutInSeconds: 300,
                // Both adapters patched: registration forces platform, auth forces UV=required
                webAuthn: { startRegistration: wrappedStartRegistration, startAuthentication: wrappedStartAuthentication },
            });
        } catch (error) {
            console.error('Failed to initialize SmartAccountKit:', error);
            this.initPromise = null; // Reset on failure so retry works
            throw error;
        }
    }

    /**
     * Login with Passkey (Usernameless / Discoverable Credentials)
     * No email required - browser shows all available passkeys for this site
     */
    async discoverLogin(): Promise<AuthResponse> {
        try {
            // 1. Get a one-time challenge from the backend.
            const challengeResponse = await fetch(`${this.baseUrl}/auth/passkey-login/discover`);

            if (!challengeResponse.ok) {
                throw new Error('Failed to get login challenge');
            }

            const { challenge, rpId } = await challengeResponse.json();

            // 2. Produce a WebAuthn assertion (biometric). Empty allowCredentials =
            // the browser shows all discoverable passkeys for this RP.
            // CRITICAL: rpId must match the value used during registration, or the
            // browser won't find credentials registered under the parent domain.
            const { startAuthentication } = await import('@simplewebauthn/browser');
            const assertion = await startAuthentication({
                optionsJSON: {
                    challenge,
                    rpId,
                    allowCredentials: [],
                    userVerification: 'required',
                    timeout: 60000,
                },
            });

            // Cache the credential id for silent transaction signing later.
            this.lastCredentialId = assertion.id;

            // 3. Send the FULL assertion. The backend verifies the signature
            // server-side — the credentialId alone is NOT proof of possession.
            const authResponse = await fetch(`${this.baseUrl}/auth/passkey-login/discover`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ assertion }),
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
     * Register a new passkey and deploy smart wallet.
     * Uses SmartAccountKit.createWallet() which handles:
     *  - WebAuthn passkey creation
     *  - Builds deployment transaction
     *  - Signs with deployer keypair
     *  - Optionally auto-submits
     */
    async register(username: string): Promise<{ credentialId: string; contractId: string; publicKey: string }> {
        await this.init();
        if (!this.kit) throw new Error('SmartAccountKit not initialized');

        try {
            // createWallet handles passkey creation + deploy TX building + signing
            const result = await this.kit.createWallet('Stellar Tokens', username, {
                autoSubmit: true, // Let the SDK submit via relayer (Channels)
                authenticatorSelection: {
                    authenticatorAttachment: 'platform',
                    residentKey: 'required',
                    userVerification: 'required',
                },
            });

            if (!result || !result.credentialId || !result.contractId || !result.publicKey) {
                throw new Error('Failed to create wallet - missing required data');
            }

            // Verify deployment actually succeeded — SDK returns { success: false } silently
            if (result.submitResult && !result.submitResult.success) {
                console.error('[SmartAccount] Deploy failed:', result.submitResult.error);
                throw new Error(
                    `Wallet deployment failed: ${result.submitResult.error || 'Transaction was not confirmed on-chain'}. Please try again.`
                );
            }

            console.log('[SmartAccount] Wallet created successfully');
            console.log('[SmartAccount] Contract ID:', result.contractId);
            console.log('[SmartAccount] Credential ID:', result.credentialId);

            return {
                credentialId: result.credentialId,
                contractId: result.contractId,
                // Raw 65-byte secp256r1 public key — the backend stores this to
                // verify login assertions server-side.
                publicKey: bytesToBase64(result.publicKey),
            };
        } catch (error: any) {
            console.error('Registration error:', error);
            throw error;
        }
    }

    /**
     * Sign a transaction with the user's Passkey.
     * Uses SmartAccountKit.signAndSubmit() for the full flow:
     *   sign auth entries → re-simulate → assemble → submit
     * 
     * @param xdr - The transaction XDR string to sign
     * @param walletContractId - Optional smart wallet contract ID
     * @returns Signed transaction XDR string
     */
    async signTransaction(xdr: string, _walletContractId?: string): Promise<string> {
        await this.init();
        if (!this.kit) throw new Error('SmartAccountKit not initialized');

        // Ensure wallet is connected with a credential (needed for signAuthEntry)
        if (!this.kit.credentialId) {
            if (this.lastCredentialId) {
                // Use cached credential from login — silent connect, no prompt
                console.log('[SmartAccount] Silent connect with cached credential');
                await this.kit.connectWallet({ credentialId: this.lastCredentialId });
            } else {
                // Fallback: prompt user for passkey (shouldn't happen in normal flow)
                console.log('[SmartAccount] No cached credential, prompting passkey...');
                await this.kit.connectWallet({ prompt: true });
            }
        }

        try {
            const { TransactionBuilder } = await import('@stellar/stellar-sdk');

            // Parse the prepared transaction from base64 XDR
            const tx = TransactionBuilder.fromXDR(xdr, this.kit.networkPassphrase);

            // Get the Soroban auth entries from the transaction's invokeHostFunction operation
            const op = tx.operations[0] as any;
            if (!op?.auth?.length) {
                console.warn('[SmartAccount] No auth entries found in transaction');
                return tx.toXDR();
            }

            // Sign each auth entry that belongs to our smart wallet
            const contractId = this.kit.contractId!;
            const signedAuth: typeof op.auth = [];

            for (const entry of op.auth) {
                const creds = entry.credentials();
                // Only sign Address-type credentials that match our wallet
                if (creds.switch().name === 'sorobanCredentialsAddress') {
                    const addrCreds = creds.address();
                    const addr = addrCreds.address();
                    // Check if this auth entry is for our smart wallet contract
                    const addrType = addr.switch().name;
                    if (addrType === 'scAddressTypeContract') {
                        const entryContractId = (await import('@stellar/stellar-sdk')).StrKey.encodeContract(addr.contractId());
                        if (entryContractId === contractId) {
                            const signedEntry = await this.kit.signAuthEntry(entry);
                            signedAuth.push(signedEntry);
                            continue;
                        }
                    }
                }
                // Keep non-matching entries as-is
                signedAuth.push(entry);
            }

            // Rebuild the transaction with signed auth entries.
            // CRITICAL: Preserve sorobanData from the original TX — cloneFrom drops it
            // if not explicitly passed, causing tx_malformed on submission.
            const { TransactionBuilder: TB, Operation } = await import('@stellar/stellar-sdk');

            // Extract sorobanData from the original transaction's XDR
            let sorobanData: any;
            try {
                const envXdr = tx.toEnvelope();
                const txBody = envXdr.v1().tx();
                sorobanData = txBody.ext().sorobanData();
            } catch {
                // Non-Soroban TX or sorobanData not present — proceed without
            }

            const newTx = TB.cloneFrom(tx as any, {
                fee: tx.fee,
                sorobanData,
            }).clearOperations().addOperation(
                Operation.invokeHostFunction({
                    func: op.func,
                    auth: signedAuth,
                })
            ).build();

            return newTx.toXDR();
        } catch (error: any) {
            console.error('Signing error:', error);
            throw error;
        }
    }
}

export const passkeyClient = new PasskeyClient();
