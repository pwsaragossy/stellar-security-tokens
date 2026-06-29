import { Building2, Clock, Mail } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

export function CompanyPendingApproval() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
            <div className="w-full max-w-md space-y-8 relative">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-amber-500/20 rounded-full blur-3xl -z-10" />

                <div className="text-center space-y-2">
                    <div className="flex justify-center mb-4">
                        <div className="p-3 bg-amber-500/20 rounded-xl">
                            <Clock className="w-8 h-8 text-amber-400" />
                        </div>
                    </div>
                    <h1 className="text-3xl font-bold tracking-tighter text-white">Registration Submitted</h1>
                    <p className="text-muted-foreground">Your company account is under review</p>
                </div>

                <Card className="border-slate-800 bg-slate-900/90">
                    <CardHeader className="text-center">
                        <CardTitle className="text-white flex items-center justify-center gap-2">
                            <Building2 className="w-5 h-5 text-teal-400" />
                            Account Pending Approval
                        </CardTitle>
                        <CardDescription className="text-slate-400">
                            Thank you for registering your company on our platform.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
                            <h3 className="font-medium text-amber-400 mb-2">What happens next?</h3>
                            <ul className="text-sm text-slate-300 space-y-2">
                                <li className="flex items-start gap-2">
                                    <span className="text-amber-400">1.</span>
                                    Our team will review your company information
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-amber-400">2.</span>
                                    This usually takes 1-2 business days
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-amber-400">3.</span>
                                    You will receive an email with the result
                                </li>
                            </ul>
                        </div>

                        <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg">
                            <Mail className="w-5 h-5 text-teal-400" />
                            <div className="text-sm">
                                <p className="text-slate-300">Check your email</p>
                                <p className="text-slate-500">We sent a confirmation to your registered email</p>
                            </div>
                        </div>

                        <div className="pt-4 border-t border-slate-800">
                            <Link to="/login">
                                <Button variant="outline" className="w-full">
                                    Return to Login
                                </Button>
                            </Link>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
