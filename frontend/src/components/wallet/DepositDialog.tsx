import { useState } from 'react';
import {
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Check, Shield, ExternalLink, Wallet, CreditCard, ArrowLeftRight } from 'lucide-react';

interface DepositDialogProps {
    walletAddress: string;
    network?: 'testnet' | 'mainnet';
}

// Simple QR Code component using inline SVG (no external dependencies)
function QRCode({ value, size = 180 }: { value: string; size?: number }) {
    // For MVP, we'll show a placeholder with the address
    // In production, integrate with a QR library like 'qrcode'
    return (
        <div
            className="bg-white p-4 rounded-xl inline-block"
            style={{ width: size, height: size }}
        >
            <div className="w-full h-full flex items-center justify-center bg-gray-100 rounded-lg border-2 border-dashed border-gray-300">
                <div className="text-center px-2">
                    <Wallet className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                    <p className="text-[10px] text-gray-500 font-mono break-all leading-tight">
                        {value.slice(0, 8)}...{value.slice(-8)}
                    </p>
                </div>
            </div>
        </div>
    );
}

export function DepositDialog({ walletAddress, network = 'testnet' }: DepositDialogProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(walletAddress);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const onRamps = [
        { name: 'Coinbase', url: 'https://www.coinbase.com', description: 'Buy USDC, then withdraw to Stellar' },
        { name: 'Kraken', url: 'https://www.kraken.com', description: 'Supports direct Stellar USDC withdrawals' },
        { name: 'Binance', url: 'https://www.binance.com', description: 'Convert and withdraw to Stellar network' },
    ];

    const bridges = [
        { name: 'Circle Bridge', url: 'https://www.circle.com/en/cross-chain-transfer-protocol', description: 'Official USDC cross-chain transfers' },
        { name: 'Stellar Anchor Directory', url: 'https://anchors.stellar.org/', description: 'Find verified Stellar anchors' },
    ];

    return (
        <DialogContent className="sm:max-w-lg bg-slate-900 border-white/10 text-white">
            <DialogHeader>
                <DialogTitle>Deposit Funds</DialogTitle>
                <DialogDescription>
                    Add USDC to your wallet to start investing.
                </DialogDescription>
            </DialogHeader>

            <Tabs defaultValue="direct" className="w-full">
                <TabsList className="grid w-full grid-cols-3 bg-white/5">
                    <TabsTrigger value="direct" className="data-[state=active]:bg-blue-600 text-xs">
                        <Wallet className="w-3 h-3 mr-1" />
                        Direct
                    </TabsTrigger>
                    <TabsTrigger value="buy" className="data-[state=active]:bg-blue-600 text-xs">
                        <CreditCard className="w-3 h-3 mr-1" />
                        Buy Crypto
                    </TabsTrigger>
                    <TabsTrigger value="bridge" className="data-[state=active]:bg-blue-600 text-xs">
                        <ArrowLeftRight className="w-3 h-3 mr-1" />
                        Bridge
                    </TabsTrigger>
                </TabsList>

                {/* Direct Deposit Tab */}
                <TabsContent value="direct" className="space-y-4 mt-4">
                    <div className="flex flex-col items-center space-y-4">
                        <QRCode value={walletAddress} />

                        <div className="w-full space-y-2">
                            <p className="text-xs text-center text-gray-400">Your Stellar Deposit Address</p>
                            <div className="flex items-center gap-2 p-3 bg-black/40 rounded-lg border border-white/5">
                                <p className="text-xs font-mono text-gray-300 break-all flex-1">
                                    {walletAddress}
                                </p>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 hover:bg-white/10 shrink-0"
                                    onClick={handleCopy}
                                >
                                    {copied ? (
                                        <Check className="w-4 h-4 text-emerald-400" />
                                    ) : (
                                        <Copy className="w-4 h-4 text-gray-400" />
                                    )}
                                </Button>
                            </div>
                            <div className="flex items-center justify-center gap-2">
                                <span className="px-2 py-0.5 rounded text-[10px] bg-blue-500/20 text-blue-400">
                                    Network: Stellar {network === 'testnet' ? 'Testnet' : 'Mainnet'}
                                </span>
                            </div>
                        </div>
                    </div>
                </TabsContent>

                {/* Buy Crypto Tab */}
                <TabsContent value="buy" className="space-y-3 mt-4">
                    <p className="text-sm text-gray-400">
                        Purchase USDC from an exchange and withdraw to your Stellar address:
                    </p>
                    <div className="space-y-2">
                        {onRamps.map((ramp) => (
                            <a
                                key={ramp.name}
                                href={ramp.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                            >
                                <div>
                                    <p className="font-medium text-sm">{ramp.name}</p>
                                    <p className="text-xs text-gray-400">{ramp.description}</p>
                                </div>
                                <ExternalLink className="w-4 h-4 text-gray-400" />
                            </a>
                        ))}
                    </div>
                    <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                        <p className="text-xs text-blue-300">
                            <strong>Tip:</strong> When withdrawing, select <strong>Stellar (XLM)</strong> as the network
                            and use your deposit address above.
                        </p>
                    </div>
                </TabsContent>

                {/* Bridge Tab */}
                <TabsContent value="bridge" className="space-y-3 mt-4">
                    <p className="text-sm text-gray-400">
                        Already have USDC on Ethereum, Solana, or Polygon? Bridge it to Stellar:
                    </p>
                    <div className="space-y-2">
                        {bridges.map((bridge) => (
                            <a
                                key={bridge.name}
                                href={bridge.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                            >
                                <div>
                                    <p className="font-medium text-sm">{bridge.name}</p>
                                    <p className="text-xs text-gray-400">{bridge.description}</p>
                                </div>
                                <ExternalLink className="w-4 h-4 text-gray-400" />
                            </a>
                        ))}
                    </div>
                </TabsContent>
            </Tabs>

            {/* Safety Warning - Always visible */}
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <div className="flex items-start gap-2">
                    <Shield className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                    <div>
                        <p className="font-semibold text-red-400 text-sm">Important</p>
                        <p className="text-xs text-red-300 mt-1">
                            Only send <strong>Stellar Network USDC</strong> to this address.
                            Sending assets from other networks directly will result in <strong>permanent loss</strong>.
                        </p>
                    </div>
                </div>
            </div>
        </DialogContent>
    );
}
