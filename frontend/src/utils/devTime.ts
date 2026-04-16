/**
 * Dev-only time override utility.
 * In production, devNow() returns Date.now() with zero overhead.
 * In dev, it returns Date.now() + offset controlled by the DevTimeTool widget.
 */

let _offset = 0;
const _listeners = new Set<() => void>();

export function devNow(): number {
    return Date.now() + _offset;
}

export function devDate(): Date {
    return new Date(devNow());
}

export function getDevOffset(): number {
    return _offset;
}

export function setDevOffset(ms: number): void {
    _offset = ms;
    _listeners.forEach((fn) => fn());
}

export function resetDevTime(): void {
    setDevOffset(0);
}

/** Subscribe to offset changes — returns unsubscribe fn */
export function onDevTimeChange(fn: () => void): () => void {
    _listeners.add(fn);
    return () => _listeners.delete(fn);
}
