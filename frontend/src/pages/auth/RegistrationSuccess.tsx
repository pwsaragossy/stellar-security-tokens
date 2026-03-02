
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, ArrowRight, ShieldCheck } from 'lucide-react';

export function RegistrationSuccess() {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
            <div className="w-full max-w-lg space-y-8 relative">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-green-500/10 rounded-full blur-3xl -z-10" />

                <div className="text-center space-y-2">
                    <div className="flex justify-center mb-4">
                        <div className="p-3 bg-green-500/20 rounded-full">
                            <CheckCircle2 className="w-10 h-10 text-green-400" />
                        </div>
                    </div>
                    <h1 className="text-3xl font-bold tracking-tighter text-white">Account Created!</h1>
                    <p className="text-muted-foreground">Your smart wallet is ready to use.</p>
                </div>

                <Card className="border-slate-800 bg-slate-900/90 backdrop-blur-xl">
                    <CardHeader>
                        <CardTitle className="text-white">Welcome to Radox</CardTitle>
                        <CardDescription className="text-slate-400">
                            Your account has been created successfully. Now let's make sure your passkey works.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="p-4 bg-teal-500/10 border border-teal-500/30 rounded-lg flex gap-3">
                            <ShieldCheck className="w-6 h-6 text-teal-400 flex-shrink-0" />
                            <div className="space-y-1">
                                <p className="text-sm font-medium text-teal-200">Important!</p>
                                <p className="text-xs text-teal-200/70">
                                    Please log in now to confirm your passkey was saved correctly.
                                    This ensures you won't lose access to your wallet.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button
                            onClick={() => navigate('/login')}
                            className="w-full bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-900/20 h-12 text-lg"
                        >
                            <span className="flex items-center gap-2">
                                Go to Login <ArrowRight className="w-5 h-5" />
                            </span>
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        </div>
    );
}
