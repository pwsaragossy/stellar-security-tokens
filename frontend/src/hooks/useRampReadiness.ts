/**
 * Readiness hook — single source of truth for whether the investor can use
 * the BRL/PIX ramp. Polls every 30s while the gate is closed, stops once
 * isReady is true (re-opens on explicit `refetch()`).
 *
 * Usage:
 *   const { readiness, isReady, loading, error, refetch } = useRampReadiness();
 *
 * The hook is intentionally lightweight: no SWR, no global cache. Each
 * consuming page mounts its own poller. We don't need cross-page consistency —
 * the readiness check is cheap and the gated state is what the user came for.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { rampApi, type RampReadiness } from '@/api/ramp';

const POLL_INTERVAL_MS = 30_000;

interface UseRampReadiness {
  readiness: RampReadiness | null;
  isReady: boolean;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useRampReadiness(): UseRampReadiness {
  const [readiness, setReadiness] = useState<RampReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollHandle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const fetchOnce = useCallback(async () => {
    try {
      const res = await rampApi.getReadiness();
      if (!mountedRef.current) return;
      if (res.success && res.data) {
        setReadiness(res.data);
        setError(null);
      } else {
        setError(res.error ?? 'unknown_error');
      }
    } catch (err: any) {
      if (!mountedRef.current) return;
      setError(err?.response?.data?.error ?? err?.message ?? 'network_error');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchOnce();
    return () => {
      mountedRef.current = false;
      if (pollHandle.current) clearTimeout(pollHandle.current);
    };
  }, [fetchOnce]);

  // Poll while not ready. Stops as soon as isReady flips to true.
  useEffect(() => {
    if (pollHandle.current) clearTimeout(pollHandle.current);
    if (readiness?.isReady) return;
    pollHandle.current = setTimeout(fetchOnce, POLL_INTERVAL_MS);
    return () => {
      if (pollHandle.current) clearTimeout(pollHandle.current);
    };
  }, [readiness, fetchOnce]);

  return {
    readiness,
    isReady: !!readiness?.isReady,
    loading,
    error,
    refetch: fetchOnce,
  };
}

export default useRampReadiness;
