import { useMemo } from 'react';

interface IdenticonProps {
    seed: string | null | undefined;
    size?: number;
    className?: string;
}

function fnv1a(input: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
}

export function Identicon({ seed, size = 32, className = '' }: IdenticonProps) {
    const parts = useMemo(() => {
        if (!seed) return null;
        const h = fnv1a(seed);
        const hue1 = h % 360;
        const hue2 = (hue1 + 40 + ((h >> 8) % 80)) % 360;
        const angle = (h >> 16) % 360;
        const shape = (h >> 4) % 3;
        const accentHue = (hue1 + 180) % 360;
        const accentSize = size * 0.45;
        const center = size / 2;
        return { hue1, hue2, angle, shape, accentHue, accentSize, center };
    }, [seed, size]);

    if (!parts) {
        return (
            <div
                className={`rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 ${className}`}
                style={{ width: size, height: size }}
            />
        );
    }

    const { hue1, hue2, angle, shape, accentHue, accentSize, center } = parts;
    const gradId = `ident-${hue1}-${hue2}-${angle}`;

    return (
        <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className={`rounded-full ${className}`}
            aria-hidden="true"
        >
            <defs>
                <linearGradient id={gradId} gradientTransform={`rotate(${angle} 0.5 0.5)`} x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor={`hsl(${hue1} 70% 45%)`} />
                    <stop offset="100%" stopColor={`hsl(${hue2} 70% 35%)`} />
                </linearGradient>
            </defs>
            <rect width={size} height={size} fill={`url(#${gradId})`} />
            {shape === 0 && (
                <circle cx={center} cy={center} r={accentSize / 2} fill={`hsl(${accentHue} 80% 70%)`} fillOpacity={0.6} />
            )}
            {shape === 1 && (
                <polygon
                    points={`${center},${center - accentSize / 2} ${center + accentSize / 2},${center + accentSize / 2} ${center - accentSize / 2},${center + accentSize / 2}`}
                    fill={`hsl(${accentHue} 80% 70%)`}
                    fillOpacity={0.6}
                />
            )}
            {shape === 2 && (
                <rect
                    x={center - accentSize / 2}
                    y={center - accentSize / 2}
                    width={accentSize}
                    height={accentSize}
                    transform={`rotate(${angle / 2} ${center} ${center})`}
                    fill={`hsl(${accentHue} 80% 70%)`}
                    fillOpacity={0.6}
                />
            )}
        </svg>
    );
}
