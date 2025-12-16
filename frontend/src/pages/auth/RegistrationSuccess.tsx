
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Mail, ArrowRight } from 'lucide-react';

export function RegistrationSuccess() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
            <div className="w-full max-w-md space-y-8 relative">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-green-500/20 rounded-full blur-3xl -z-10" />

                <Card className="border-slate-800 bg-slate-900/90 backdrop-blur-xl text-center">
                    <CardHeader>
                        <div className="mx-auto w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mb-4">
                            <Mail className="w-8 h-8 text-green-400" />
                        </div>
                        <CardTitle className="text-white text-2xl">Check Your Email!</CardTitle>
                        <CardDescription className="text-slate-400">
                            We've sent a verification link to your email address.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="bg-slate-800/50 rounded-lg p-4 text-left space-y-2">
                            <p className="text-sm text-slate-300">
                                <span className="font-semibold text-white">Next steps:</span>
                            </p>
                            <ol className="text-sm text-slate-400 list-decimal list-inside space-y-1">
                                <li>Open the email we just sent you</li>
                                <li>Click the verification link</li>
                                <li>Complete your KYC to start investing</li>
                            </ol>
                        </div>

                        <p className="text-xs text-slate-500">
                            Didn't receive the email? Check your spam folder or wait a few minutes.
                        </p>

                        <Link to="/login">
                            <Button className="w-full bg-blue-600 hover:bg-blue-500 text-white">
                                Go to Login <ArrowRight className="ml-2 w-4 h-4" />
                            </Button>
                        </Link>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
