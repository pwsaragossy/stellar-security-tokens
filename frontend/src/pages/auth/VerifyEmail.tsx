import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';

export function VerifyEmail() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const token = searchParams.get('token');
    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
    const [message, setMessage] = useState('');

    useEffect(() => {
        if (!token) {
            setStatus('error');
            setMessage('Token de verificação não encontrado.');
            return;
        }

        const verify = async () => {
            try {
                await api.post('/investors/verify-email', { token });
                setStatus('success');
                setMessage('Email verificado com sucesso! Sua conta está ativa.');

                // Auto redirect after 3 seconds
                setTimeout(() => {
                    navigate('/dashboard');
                }, 3000);
            } catch (error: any) {
                setStatus('error');
                setMessage(error.response?.data?.error || 'Falha ao verificar email.');
            }
        };

        verify();
    }, [token, navigate]);

    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
            <Card className="w-full max-w-md border-slate-800 bg-slate-900/50 backdrop-blur-xl">
                <CardHeader className="text-center">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-800">
                        {status === 'loading' && <Loader2 className="h-6 w-6 animate-spin text-primary" />}
                        {status === 'success' && <CheckCircle2 className="h-6 w-6 text-green-500" />}
                        {status === 'error' && <XCircle className="h-6 w-6 text-red-500" />}
                    </div>
                    <CardTitle className="text-2xl text-slate-100">Verificação de Email</CardTitle>
                    <CardDescription className="text-slate-400">
                        {status === 'loading' && 'Processando sua verificação...'}
                        {status === 'success' && 'Tudo pronto!'}
                        {status === 'error' && 'Houve um problema.'}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-center">
                    <p className={`text-sm ${status === 'error' ? 'text-red-400' : 'text-slate-300'}`}>
                        {message}
                    </p>

                    {status !== 'loading' && (
                        <Button
                            className="w-full"
                            onClick={() => navigate(status === 'success' ? '/dashboard' : '/login')}
                        >
                            {status === 'success' ? 'Ir para Dashboard' : 'Voltar para Login'}
                        </Button>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
