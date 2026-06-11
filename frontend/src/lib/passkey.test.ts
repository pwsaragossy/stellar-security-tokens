import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock @simplewebauthn/browser so init()'s dynamic import is cheap in jsdom.
vi.mock('@simplewebauthn/browser', () => ({
    startRegistration: vi.fn(),
    startAuthentication: vi.fn(),
}));

// vi.mock factories are hoisted before module-scope consts, so any
// values the factory closes over must be created via vi.hoisted().
const kitMock = vi.hoisted(() => {
    const mockSignAuthEntry = vi.fn();
    const mockResolve = vi.fn();
    const SmartAccountKitCtor = vi.fn(function (this: any) {
        this.rpcUrl = 'https://soroban-testnet.stellar.org';
        this.networkPassphrase = 'Test SDF Network ; September 2015';
        this.accountWasmHash = 'hash';
        this.webauthnVerifierAddress = 'CABC';
        this.contractId = 'CINTERNAL_WALLET';
        this.credentialId = 'cred-abc';
        this.connectWallet = vi.fn();
        this.signAuthEntry = mockSignAuthEntry;
        // The kit's canonical per-entry resolver: walks the auth entry's
        // invocation tree and returns one context-rule id per context.
        this.resolveConnectedContextRuleIds = mockResolve;
    });
    return { mockSignAuthEntry, mockResolve, SmartAccountKitCtor };
});

vi.mock('smart-account-kit', () => ({
    SmartAccountKit: kitMock.SmartAccountKitCtor,
}));

// Mock @stellar/stellar-sdk (used via dynamic import inside signTransaction).
// fromXDR parses our JSON "xdr" into fake auth entries with the method chain
// signTransaction walks. StrKey.encodeContract maps the wallet entry's
// contract id bytes back to the kit's connected contractId.
const sdk = vi.hoisted(() => {
    // descriptor kinds: 'wallet' (our contract), 'other' (other contract),
    // 'account' (G-address credential), 'nonaddress' (source-account creds)
    const makeEntry = (kind: string) => {
        const creds = {
            switch: () => ({
                name: kind === 'nonaddress'
                    ? 'sorobanCredentialsSourceAccount'
                    : 'sorobanCredentialsAddress',
            }),
            address: () => ({
                address: () => ({
                    switch: () => ({
                        name: kind === 'account' ? 'scAddressTypeAccount' : 'scAddressTypeContract',
                    }),
                    contractId: () => (kind === 'wallet' ? 'WALLET' : 'OTHER'),
                }),
            }),
        };
        return { __kind: kind, credentials: () => creds };
    };

    const invokeHostFunction = vi.fn((args: any) => ({ __op: args }));

    const TransactionBuilder = {
        fromXDR: vi.fn((xdr: string) => {
            const parsed = JSON.parse(xdr);
            const auth = (parsed.auth || []).map(makeEntry);
            return {
                operations: [{ auth, func: 'FUNC' }],
                networkPassphrase: parsed.networkPassphrase,
                fee: '100',
                toEnvelope: () => ({
                    v1: () => ({ tx: () => ({ ext: () => ({ sorobanData: () => undefined }) }) }),
                }),
                toXDR: () => 'PARSED_TX_XDR',
            };
        }),
        cloneFrom: vi.fn(() => {
            const builder: any = {
                clearOperations: () => builder,
                addOperation: () => builder,
                build: () => ({ toXDR: () => 'SIGNED_XDR' }),
            };
            return builder;
        }),
    };

    const Operation = { invokeHostFunction };
    const StrKey = {
        encodeContract: vi.fn((id: string) => (id === 'WALLET' ? 'CINTERNAL_WALLET' : 'COTHER')),
    };

    return { TransactionBuilder, Operation, StrKey, invokeHostFunction };
});

vi.mock('@stellar/stellar-sdk', () => ({
    TransactionBuilder: sdk.TransactionBuilder,
    Operation: sdk.Operation,
    StrKey: sdk.StrKey,
}));

const fetchMock = vi.hoisted(() =>
    vi.fn(async () => ({
        ok: true,
        json: async () => ({
            rpcUrl: 'https://soroban-testnet.stellar.org',
            networkPassphrase: 'Test SDF Network ; September 2015',
            accountWasmHash: 'hash',
            webauthnVerifierAddress: 'CABC',
            rpId: 'example.com',
        }),
    }))
);
vi.stubGlobal('fetch', fetchMock);

import { PasskeyClient } from '@/lib/passkey';

const buildXdr = (auth: string[]) =>
    JSON.stringify({ networkPassphrase: 'Test SDF Network ; September 2015', auth });

describe('PasskeyClient.signTransaction — per-context context_rule_ids', () => {
    beforeEach(() => {
        kitMock.mockSignAuthEntry.mockReset();
        kitMock.mockResolve.mockReset();
        kitMock.SmartAccountKitCtor.mockClear();
        sdk.invokeHostFunction.mockClear();
        sdk.TransactionBuilder.fromXDR.mockClear();
        sdk.StrKey.encodeContract.mockClear();
        fetchMock.mockClear();
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
        sessionStorage.clear();

        // Default: a 2-context entry (trade + nested transfer) resolves to [0, 0].
        kitMock.mockResolve.mockResolvedValue([0, 0]);
        kitMock.mockSignAuthEntry.mockImplementation(async (entry: any) => ({
            __signed: entry.__kind,
        }));
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('resolves rule ids per entry and passes them verbatim to signAuthEntry', async () => {
        const client = new PasskeyClient();

        const result = await client.signTransaction(buildXdr(['wallet']));

        // The resolver is consulted for the wallet entry, with the connected credential.
        expect(kitMock.mockResolve).toHaveBeenCalledTimes(1);
        const [resolvedEntry, resolvedCred] = kitMock.mockResolve.mock.calls[0];
        expect(resolvedEntry.__kind).toBe('wallet');
        expect(resolvedCred).toBe('cred-abc');

        // Whatever the resolver returns is exactly what signAuthEntry receives —
        // for a trade (2 contexts) that's a length-2 array, satisfying the
        // contract's context_rule_ids.length === auth_contexts.length invariant.
        expect(kitMock.mockSignAuthEntry).toHaveBeenCalledTimes(1);
        const [signedEntry, opts] = kitMock.mockSignAuthEntry.mock.calls[0];
        expect(signedEntry.__kind).toBe('wallet');
        expect(opts.contextRuleIds).toEqual([0, 0]);
        expect(opts.credentialId).toBe('cred-abc');

        expect(result).toBe('SIGNED_XDR');
    });

    it('resolves length-1 for a single-context entry (e.g. plain transfer)', async () => {
        kitMock.mockResolve.mockResolvedValue([0]);
        const client = new PasskeyClient();

        await client.signTransaction(buildXdr(['wallet']));

        const [, opts] = kitMock.mockSignAuthEntry.mock.calls[0];
        expect(opts.contextRuleIds).toEqual([0]);
    });

    it('only signs entries that belong to our wallet; others pass through untouched', async () => {
        const client = new PasskeyClient();

        await client.signTransaction(buildXdr(['other', 'wallet', 'account', 'nonaddress']));

        // Resolver + signing happen exactly once — only for the wallet entry.
        expect(kitMock.mockResolve).toHaveBeenCalledTimes(1);
        expect(kitMock.mockSignAuthEntry).toHaveBeenCalledTimes(1);
        expect(kitMock.mockResolve.mock.calls[0][0].__kind).toBe('wallet');

        // All four entries are present in the rebuilt operation: one signed,
        // three carried through as-is.
        const rebuiltAuth = sdk.invokeHostFunction.mock.calls[0][0].auth;
        expect(rebuiltAuth).toHaveLength(4);
        const signed = rebuiltAuth.filter((e: any) => e.__signed === 'wallet');
        expect(signed).toHaveLength(1);
        const passedThrough = rebuiltAuth.filter((e: any) => e.__kind && e.__signed === undefined);
        expect(passedThrough.map((e: any) => e.__kind).sort()).toEqual([
            'account', 'nonaddress', 'other',
        ]);
    });

    it('returns the parsed tx unchanged when there are no auth entries', async () => {
        const client = new PasskeyClient();

        const result = await client.signTransaction(buildXdr([]));

        expect(kitMock.mockResolve).not.toHaveBeenCalled();
        expect(kitMock.mockSignAuthEntry).not.toHaveBeenCalled();
        expect(result).toBe('PARSED_TX_XDR');
    });

    it('silently connects with the cached credential when none is attached yet', async () => {
        const client = new PasskeyClient();
        await client.init();
        // Simulate a fresh kit that has not connected a credential.
        (client as any).kit.credentialId = undefined;
        sessionStorage.setItem('radox_passkey_credential', 'cached-cred');

        await client.signTransaction(buildXdr(['wallet']));

        expect((client as any).kit.connectWallet).toHaveBeenCalledWith({ credentialId: 'cached-cred' });
        // credentialId falls back to the cached id for resolution + signing.
        expect(kitMock.mockResolve.mock.calls[0][1]).toBe('cached-cred');
    });
});
