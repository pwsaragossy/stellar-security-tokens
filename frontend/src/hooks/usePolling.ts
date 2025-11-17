import { useEffect, useRef } from 'react';

export function usePolling(
  callback: () => void | Promise<void>,
  interval: number = 3000,
  enabled: boolean = true
) {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return;

    const poll = async () => {
      await callbackRef.current();
    };

    poll(); // Call immediately
    const intervalId = setInterval(poll, interval);

    return () => clearInterval(intervalId);
  }, [interval, enabled]);
}

