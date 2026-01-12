
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, ArrowDownLeft, ArrowUpRight, Clock, Receipt } from 'lucide-react';
import { api } from '@/lib/api';

interface Transaction {
    id: number;
    type: string;
    amount: number;
    date: string;
    status: string;
    assetCode?: string;
}

export function Transactions() {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchTransactions() {
            try {
                const userStr = localStorage.getItem('user');
                if (!userStr) throw new Error('User not found');

                const user = JSON.parse(userStr);
                const response = await api.get(`/investors/${user.id}/payments?limit=50`);

                const data = response.data || response;
                const paymentsList = Array.isArray(data) ? data : (data.payments || []);

                setTransactions(paymentsList.map((p: any) => ({
                    id: p.id,
                    type: p.type || 'Interest Payment',
                    amount: Number(p.usdcAmount || p.amount) || 0,
                    date: p.paymentDate || p.payment_date || p.created_at || new Date().toISOString(),
                    status: p.status || 'completed',
                    assetCode: p.assetCode || p.asset_code,
                })));
            } catch (err: any) {
                console.error('Failed to fetch transactions:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }

        fetchTransactions();
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[50vh]">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-10 h-10 animate-spin text-[hsl(43_45%_55%)]" />
                    <p className="text-muted-foreground text-sm">Loading transactions...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 bg-red-500/10 text-red-400 rounded-xl border border-red-500/20 animate-fade-in">
                Failed to load transactions: {error}
            </div>
        );
    }

    const getStatusColor = (status: string) => {
        switch (status.toLowerCase()) {
            case 'completed': return 'text-[hsl(160_60%_40%)] bg-[hsl(160_60%_40%/0.1)] border border-[hsl(160_60%_40%/0.3)]';
            case 'pending': return 'text-[hsl(35_90%_50%)] bg-[hsl(35_90%_50%/0.1)] border border-[hsl(35_90%_50%/0.3)]';
            case 'failed': return 'text-red-400 bg-red-500/10 border border-red-500/30';
            default: return 'text-muted-foreground bg-muted/50 border border-white/10';
        }
    };

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="space-y-1 animate-fade-in">
                <h2 className="text-3xl font-bold tracking-tight">Transactions</h2>
                <p className="text-muted-foreground">Your complete payment history</p>
            </div>

            <Card className="glass-panel rounded-2xl animate-fade-in-up">
                <CardHeader>
                    <CardTitle className="text-xl">Transaction History</CardTitle>
                    <CardDescription>All your payment transactions</CardDescription>
                </CardHeader>
                <CardContent>
                    {transactions.length > 0 ? (
                        <div className="space-y-3">
                            {transactions.map((tx, idx) => (
                                <div
                                    key={tx.id}
                                    className="activity-item flex items-center justify-between p-4 rounded-xl"
                                    style={{ animationDelay: `${idx * 0.05}s` }}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${tx.type.includes('Payment') || tx.type.includes('Interest')
                                                ? 'bg-[hsl(160_60%_40%/0.15)]'
                                                : 'bg-[hsl(217_91%_60%/0.15)]'
                                            }`}>
                                            {tx.type.includes('Payment') || tx.type.includes('Interest') ? (
                                                <ArrowDownLeft className="w-5 h-5 text-[hsl(160_60%_40%)]" />
                                            ) : (
                                                <ArrowUpRight className="w-5 h-5 text-[hsl(217_91%_60%)]" />
                                            )}
                                        </div>
                                        <div>
                                            <p className="font-medium">{tx.type}</p>
                                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                <Clock className="w-3 h-3" />
                                                {new Date(tx.date).toLocaleDateString()} at {new Date(tx.date).toLocaleTimeString()}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className={`font-semibold ${tx.type.includes('Payment') ? 'value-success' : ''}`}>
                                            {tx.type.includes('Payment') ? '+' : ''}{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(tx.amount)}
                                        </p>
                                        <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${getStatusColor(tx.status)}`}>
                                            {tx.status}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <div className="p-5 rounded-2xl bg-muted/30 mb-4">
                                <Receipt className="w-10 h-10 text-muted-foreground/50" />
                            </div>
                            <p className="text-lg font-medium mb-1">No transactions yet</p>
                            <p className="text-sm text-muted-foreground">Your payment history will appear here.</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
