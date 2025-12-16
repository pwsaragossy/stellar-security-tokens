
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, ArrowDownLeft, ArrowUpRight, Clock } from 'lucide-react';
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
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 bg-red-500/10 text-red-400 rounded-lg border border-red-500/20">
                Failed to load transactions: {error}
            </div>
        );
    }

    const getStatusColor = (status: string) => {
        switch (status.toLowerCase()) {
            case 'completed': return 'text-emerald-400 bg-emerald-400/10';
            case 'pending': return 'text-yellow-400 bg-yellow-400/10';
            case 'failed': return 'text-red-400 bg-red-400/10';
            default: return 'text-slate-400 bg-slate-400/10';
        }
    };

    return (
        <div className="space-y-6">
            <Card className="glass-panel border-white/5 bg-white/5">
                <CardHeader>
                    <CardTitle>Transaction History</CardTitle>
                    <CardDescription>All your payment transactions</CardDescription>
                </CardHeader>
                <CardContent>
                    {transactions.length > 0 ? (
                        <div className="space-y-3">
                            {transactions.map((tx) => (
                                <div
                                    key={tx.id}
                                    className="flex items-center justify-between p-4 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${tx.type.includes('Payment') || tx.type.includes('Interest')
                                                ? 'bg-emerald-500/20'
                                                : 'bg-blue-500/20'
                                            }`}>
                                            {tx.type.includes('Payment') || tx.type.includes('Interest') ? (
                                                <ArrowDownLeft className="w-5 h-5 text-emerald-400" />
                                            ) : (
                                                <ArrowUpRight className="w-5 h-5 text-blue-400" />
                                            )}
                                        </div>
                                        <div>
                                            <p className="font-medium text-white">{tx.type}</p>
                                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                <Clock className="w-3 h-3" />
                                                {new Date(tx.date).toLocaleDateString()} at {new Date(tx.date).toLocaleTimeString()}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className={`font-semibold ${tx.type.includes('Payment') ? 'text-emerald-400' : 'text-white'}`}>
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
                        <div className="text-center py-8">
                            <Clock className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                            <p className="text-muted-foreground">No transactions yet.</p>
                            <p className="text-sm text-muted-foreground mt-1">Your payment history will appear here.</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
