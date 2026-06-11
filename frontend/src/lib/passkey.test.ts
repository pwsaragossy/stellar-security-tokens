import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock @simplewebauthn/browser so init()'s dynamic import is cheap in jsdom.
vi.mock('@simplewebauthn/browser', () => ({
    startRegistration: vi.fn(),
    startAuthentication: vi.fn(),
}));

// vi.mock factories are hoisted before module-scope consts, so any
// values the factory closes over must be created via vi.hoisted().
const kitMock = vi.hoisted(() => {
    const mockList = vi.fn();
    const SmartAccountKitCtor = vi.fn(function (this: any) {
        this.rpcUrl = 'https://soroban-testnet.stellar.org';
        this.networkPassphrase = 'Test SDF Network ; September 2015';
        this.accountWasmHash = 'hash';
        this.webauthnVerifierAddress = 'CABC';
        this.contractId = 'CINTERNAL_WALLET';
        this.credentialId = 'cred-abc';
        this.connectWallet = vi.fn();
        this.rules = { list: mockList };
        this.signAuthEntry = vi.fn();
    });
    return { mockList, SmartAccountKitCtor };
});

vi.mock('smart-account-kit', () => ({
    SmartAccountKit: kitMock.SmartAccountKitCtor,
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

describe('PasskeyClient.getContextRuleIds', () => {
    beforeEach(() => {
        kitMock.mockList.mockReset();
        kitMock.SmartAccountKitCtor.mockClear();
        fetchMock.mockClear();
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
        sessionStorage.clear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('fetches context rules from the kit and caches the result', async () => {
        kitMock.mockList.mockResolvedValueOnce([
            { id: 1, name: 'shared' },
            { id: 2, name: 'recovery' },
        ]);

        const client = new PasskeyClient();
        await client.init();

        const first = await client.getContextRuleIds();
        const second = await client.getContextRuleIds();

        expect(first).toEqual([1, 2]);
        expect(second).toEqual([1, 2]);
        expect(kitMock.mockList).toHaveBeenCalledTimes(1);
    });

    it('returns an empty array when the wallet has no rules', async () => {
        kitMock.mockList.mockResolvedValueOnce([]);

        const client = new PasskeyClient();
        await client.init();

        const ids = await client.getContextRuleIds();

        expect(ids).toEqual([]);
        expect(kitMock.mockList).toHaveBeenCalledTimes(1);
    });

    it('skips rules with non-numeric ids and does not crash', async () => {
        kitMock.mockList.mockResolvedValueOnce([
            { id: 7, name: 'a' },
            { id: 'not-a-number', name: 'b' },
            { id: null, name: 'c' },
            { name: 'd' },
        ]);

        const client = new PasskeyClient();
        await client.init();

        const ids = await client.getContextRuleIds();

        expect(ids).toEqual([7]);
    });

    it('wraps errors from the kit with a clear signing-context message', async () => {
        kitMock.mockList.mockRejectedValueOnce(new Error('RPC timeout'));

        const client = new PasskeyClient();
        await client.init();

        await expect(client.getContextRuleIds()).rejects.toThrow(
            /Failed to fetch context rules for signing: RPC timeout/
        );
    });

    it('throws when no smart wallet is connected', async () => {
        const client = new PasskeyClient();
        await client.init();
        (client as any).kit.contractId = undefined;

        await expect(client.getContextRuleIds()).rejects.toThrow(
            /no smart wallet connected/
        );
    });

    it('invalidateRulesCache forces a re-fetch on the next call', async () => {
        kitMock.mockList
            .mockResolvedValueOnce([{ id: 1 }])
            .mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);

        const client = new PasskeyClient();
        await client.init();

        const first = await client.getContextRuleIds();
        client.invalidateRulesCache();
        const second = await client.getContextRuleIds();

        expect(first).toEqual([1]);
        expect(second).toEqual([1, 2]);
        expect(kitMock.mockList).toHaveBeenCalledTimes(2);
    });

    it('reset() also clears the rules cache', async () => {
        kitMock.mockList
            .mockResolvedValueOnce([{ id: 1 }])
            .mockResolvedValueOnce([{ id: 9 }]);

        const client = new PasskeyClient();
        await client.init();

        const first = await client.getContextRuleIds();
        client.reset();
        await client.init();
        const second = await client.getContextRuleIds();

        expect(first).toEqual([1]);
        expect(second).toEqual([9]);
        expect(kitMock.mockList).toHaveBeenCalledTimes(2);
    });
});
