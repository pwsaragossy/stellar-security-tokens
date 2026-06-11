import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// authStorage is imported transitively by api.ts. It reads/writes
// localStorage and sessionStorage — both are stubbed in test/setup.ts.
const mockFetch = vi.fn();

describe('ApiClient.post — error propagation', () => {
    beforeEach(() => {
        mockFetch.mockReset();
        vi.stubGlobal('fetch', mockFetch);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('throws an Error containing the server error message on 500', async () => {
        mockFetch.mockResolvedValueOnce(
            new Response(
                JSON.stringify({ success: false, error: 'Enforcing Mode simulation failed: HostError' }),
                { status: 500, statusText: 'Internal Server Error' }
            )
        );

        const { api } = await import('@/lib/api');

        await expect(
            api.post('/investments/submit-tx', { signedXdr: 'x', investmentContext: {} })
        ).rejects.toThrow(/Enforcing Mode simulation failed: HostError/);
    });

    it('throws "Unauthorized" on 403', async () => {
        mockFetch.mockResolvedValueOnce(
            new Response(JSON.stringify({ success: false, error: 'forbidden' }), {
                status: 403,
                statusText: 'Forbidden',
            })
        );

        const { api } = await import('@/lib/api');

        await expect(api.post('/some', {})).rejects.toThrow('Unauthorized');
    });

    it('returns null on 204', async () => {
        mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

        const { api } = await import('@/lib/api');

        const result = await api.post('/void', {});
        expect(result).toBeNull();
    });

    it('returns parsed JSON on a successful 200 response', async () => {
        mockFetch.mockResolvedValueOnce(
            new Response(
                JSON.stringify({ success: true, data: { investmentContext: { hmac: 'abc' } } }),
                { status: 200, statusText: 'OK' }
            )
        );

        const { api } = await import('@/lib/api');

        const result = await api.post('/investments/purchase', { foo: 1 });
        expect(result).toEqual({ success: true, data: { investmentContext: { hmac: 'abc' } } });
    });

    it('falls back to "API Error: <statusText>" when the error body is not JSON', async () => {
        mockFetch.mockResolvedValueOnce(
            new Response('not json at all', { status: 502, statusText: 'Bad Gateway' })
        );

        const { api } = await import('@/lib/api');

        await expect(api.post('/anything', {})).rejects.toThrow('API Error: Bad Gateway');
    });
});
