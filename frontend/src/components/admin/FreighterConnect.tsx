import { useFreighter } from '../../hooks/useFreighter';
import { Loader2, Wallet, CheckCircle, XCircle, ExternalLink } from 'lucide-react';

interface FreighterConnectProps {
    onConnected?: (publicKey: string) => void;
    onDisconnected?: () => void;
    className?: string;
}

/**
 * FreighterConnect Component
 * 
 * Provides a UI for connecting to the Freighter browser extension.
 * Freighter is a secure wallet where keys never leave the extension.
 */
export function FreighterConnect({ onConnected, onDisconnected, className = '' }: FreighterConnectProps) {
    const { device, isConnecting, error, isInstalled, connect, disconnect, clearError } = useFreighter();

    const handleConnect = async () => {
        const dev = await connect();
        if (dev && onConnected) {
            onConnected(dev.publicKey);
        }
    };

    const handleDisconnect = () => {
        disconnect();
        if (onDisconnected) {
            onDisconnected();
        }
    };

    // Not installed - show install prompt
    if (!isInstalled) {
        return (
            <div className={`bg-zinc-900/50 border border-zinc-700/50 rounded-lg p-4 ${className}`}>
                <div className="flex items-center gap-2 mb-4">
                    <Wallet className="w-5 h-5 text-zinc-400" />
                    <h3 className="font-medium text-white">Freighter Wallet</h3>
                </div>

                <div className="bg-amber-900/20 border border-amber-500/30 rounded-lg p-3 mb-4">
                    <p className="text-sm text-amber-200">
                        Freighter extension not detected. Install it to sign transactions securely.
                    </p>
                </div>

                <a
                    href="https://freighter.app"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-lg transition-all text-sm font-medium"
                >
                    <ExternalLink className="w-4 h-4" />
                    Install Freighter
                </a>

                <p className="text-xs text-zinc-500 text-center mt-3">
                    Available for Chrome, Firefox, and Brave
                </p>
            </div>
        );
    }

    return (
        <div className={`bg-zinc-900/50 border border-zinc-700/50 rounded-lg p-4 ${className}`}>
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Wallet className="w-5 h-5 text-purple-400" />
                    <h3 className="font-medium text-white">Freighter Wallet</h3>
                </div>

                {device && (
                    <span className="flex items-center gap-1.5 text-sm text-emerald-400">
                        <CheckCircle className="w-4 h-4" />
                        Connected
                    </span>
                )}
            </div>

            {/* Error Display */}
            {error && (
                <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3 mb-4">
                    <div className="flex items-start gap-2">
                        <XCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                            <p className="text-sm text-red-300">{error}</p>
                            <button
                                onClick={clearError}
                                className="text-xs text-red-400 hover:text-red-300 mt-1 underline"
                            >
                                Dismiss
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Connected State */}
            {device ? (
                <div className="space-y-3">
                    <div className="bg-zinc-800/50 rounded-lg p-3">
                        <p className="text-xs text-zinc-400 mb-1">Signing Key</p>
                        <p className="font-mono text-sm text-white break-all">{device.publicKey}</p>
                        {device.network && (
                            <p className="text-xs text-zinc-500 mt-1">Network: {device.network}</p>
                        )}
                    </div>

                    <button
                        onClick={handleDisconnect}
                        className="w-full px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg transition-colors text-sm"
                    >
                        Disconnect
                    </button>
                </div>
            ) : (
                /* Disconnected State */
                <div className="space-y-3">
                    <p className="text-sm text-zinc-400">
                        Connect your Freighter wallet to sign transactions. Keys stay secure in the extension.
                    </p>

                    <button
                        onClick={handleConnect}
                        disabled={isConnecting}
                        className="w-full px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:from-zinc-600 disabled:to-zinc-600 text-white rounded-lg transition-all text-sm font-medium flex items-center justify-center gap-2"
                    >
                        {isConnecting ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Connecting...
                            </>
                        ) : (
                            <>
                                <Wallet className="w-4 h-4" />
                                Connect Freighter
                            </>
                        )}
                    </button>

                    <p className="text-xs text-zinc-500 text-center">
                        Your keys never leave the extension
                    </p>
                </div>
            )}
        </div>
    );
}

export default FreighterConnect;
