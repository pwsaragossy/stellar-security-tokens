import { useMemo, type ReactNode } from 'react';
import { AlertTriangle, Globe } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type SupportedBrowser = 'chrome' | 'safari';

interface BrowserInfo {
    browser: SupportedBrowser | 'unsupported';
    name: string;
}

function detectBrowser(): BrowserInfo {
    const ua = navigator.userAgent;

    // Safari: has Safari/ but NOT Chrome/ (Chrome UA includes "Safari")
    if (/Safari\//.test(ua) && !/Chrome\//.test(ua) && !/CriOS/.test(ua)) {
        return { browser: 'safari', name: 'Safari' };
    }

    // Chrome (desktop or iOS CriOS) — exclude Edge, Opera, Brave
    if ((/Chrome\//.test(ua) || /CriOS/.test(ua)) && !/Edg/.test(ua) && !/OPR/.test(ua)) {
        return { browser: 'chrome', name: 'Google Chrome' };
    }

    // Everything else is unsupported
    const match = ua.match(/(Firefox|Edg|OPR|Opera|Brave|Vivaldi|Samsung)/);
    return { browser: 'unsupported', name: match?.[1]?.replace('Edg', 'Edge').replace('OPR', 'Opera') || 'seu navegador' };
}

interface BrowserGateProps {
    children: ReactNode;
}

export function BrowserGate({ children }: BrowserGateProps) {
    const browserInfo = useMemo(() => detectBrowser(), []);

    if (browserInfo.browser !== 'unsupported') {
        return <>{children}</>;
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
            <div className="w-full max-w-md space-y-8 relative">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-amber-500/15 rounded-full blur-3xl -z-10" />

                <div className="text-center space-y-2">
                    <h1 className="text-3xl font-bold tracking-tighter text-white">Radox</h1>
                    <p className="text-muted-foreground">Institutional-Grade Digital Asset Platform</p>
                </div>

                <Card className="border-amber-500/30 bg-slate-900/90">
                    <CardHeader className="text-center pb-2">
                        <div className="flex justify-center mb-3">
                            <div className="p-3 bg-amber-500/20 rounded-full">
                                <AlertTriangle className="w-8 h-8 text-amber-400" />
                            </div>
                        </div>
                        <CardTitle className="text-white text-xl">
                            Navegador Incompatível
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-5">
                        <p className="text-sm text-slate-300 text-center leading-relaxed">
                            O Radox utiliza <strong className="text-white">passkeys</strong> para proteger sua carteira digital.{' '}
                            <span className="text-amber-300">{browserInfo.name}</span> não suporta a sincronização segura de passkeys necessária.
                        </p>

                        <div className="p-3 bg-red-950/40 border border-red-500/20 rounded-lg">
                            <p className="text-xs text-red-300 text-center leading-relaxed">
                                <strong>⚠️ Aviso:</strong> Criar uma passkey neste navegador pode resultar em perda permanente de acesso à sua carteira e aos seus ativos digitais. Passkeys criadas fora do Chrome ou Safari não são sincronizadas na nuvem e ficam presas a este dispositivo.
                            </p>
                        </div>

                        <div className="p-3 bg-slate-800/80 border border-white/5 rounded-lg space-y-3">
                            <p className="text-xs text-slate-400 text-center font-medium uppercase tracking-wider">
                                Navegadores compatíveis
                            </p>

                            <div className="grid grid-cols-2 gap-3">
                                <a
                                    href="https://www.google.com/chrome/"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex flex-col items-center gap-2 p-3 rounded-lg bg-slate-700/50 hover:bg-slate-700 border border-white/5 hover:border-blue-500/30 transition-all group"
                                >
                                    <Globe className="w-6 h-6 text-blue-400 group-hover:scale-110 transition-transform" />
                                    <span className="text-xs text-slate-200 font-medium">Google Chrome</span>
                                    <span className="text-[10px] text-slate-500">Google Password Manager</span>
                                </a>
                                <div className="flex flex-col items-center gap-2 p-3 rounded-lg bg-slate-700/50 border border-white/5 opacity-80">
                                    <Globe className="w-6 h-6 text-slate-300" />
                                    <span className="text-xs text-slate-200 font-medium">Safari</span>
                                    <span className="text-[10px] text-slate-500">iCloud Keychain</span>
                                </div>
                            </div>
                        </div>

                        <p className="text-[11px] text-slate-500 text-center leading-relaxed">
                            As passkeys são credenciais criptográficas sincronizadas na nuvem. Apenas Chrome e Safari garantem backup seguro via Google ou iCloud.
                        </p>

                        <Button
                            variant="outline"
                            className="w-full border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800"
                            onClick={() => window.location.reload()}
                        >
                            Já troquei — Verificar novamente
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
