import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Landmark, TrendingUp, Shield, Calendar, Percent, AlertTriangle, CheckCircle2, DollarSign, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function SelectOfferType() {
    const navigate = useNavigate();

    const handleSelectType = (type: 'collateral' | 'sale') => {
        navigate(`/company/offers/create?type=${type}`);
    };

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center gap-4 animate-fade-in">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => navigate('/company/offers')}
                    className="rounded-xl transition-transform hover:scale-110"
                >
                    <ArrowLeft className="w-5 h-5" />
                </Button>
                <div>
                    <h2 className="text-2xl font-bold font-heading text-white">Choose Offer Type</h2>
                    <p className="text-muted-foreground">Step 1 of 5 — Select the type of financial instrument</p>
                </div>
            </div>

            {/* Options Grid */}
            <div className="grid md:grid-cols-2 gap-6 animate-fade-in-up animate-delay-1">
                {/* Collateral (Debt) Option */}
                <Card
                    className="glass-panel border-white/10 bg-white/5 hover:border-primary/50 transition-all duration-300 cursor-pointer group relative overflow-hidden"
                    onClick={() => handleSelectType('collateral')}
                >
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <CardHeader className="pb-4">
                        <div className="flex items-start justify-between">
                            <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
                                <Landmark className="w-6 h-6 text-blue-400" />
                            </div>
                            <span className="text-xs font-medium text-blue-400 bg-blue-500/10 px-2 py-1 rounded-full">
                                Debt Instrument
                            </span>
                        </div>
                        <CardTitle className="text-xl mt-4 font-heading">Collateral (Debt)</CardTitle>
                        <CardDescription className="text-muted-foreground">
                            Fixed income security with guaranteed interest payments
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-3">
                            <h4 className="text-sm font-medium text-white flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                Key Features
                            </h4>
                            <ul className="space-y-2 text-sm text-muted-foreground">
                                <li className="flex items-start gap-2">
                                    <Percent className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                                    <span><strong className="text-white">Fixed Interest Rate</strong> - Investors know their returns upfront</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <Calendar className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                                    <span><strong className="text-white">Regular Payments</strong> - Monthly, quarterly, semi-annual, annual, or bullet</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <Shield className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                                    <span><strong className="text-white">Asset-Backed</strong> - Collateral protects investor funds</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <DollarSign className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                                    <span><strong className="text-white">Principal Return</strong> - Full amount returned at maturity</span>
                                </li>
                            </ul>
                        </div>

                        <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                            <p className="text-xs text-blue-300">
                                <strong>Best for:</strong> Companies seeking fixed-term financing with predictable payment obligations. Ideal for real estate, equipment financing, or working capital.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <h4 className="text-sm font-medium text-white">How It Works</h4>
                            <ol className="space-y-1 text-xs text-muted-foreground list-decimal list-inside">
                                <li>You define the total amount, interest rate, and payment schedule</li>
                                <li>Investors purchase tokens representing a portion of the debt</li>
                                <li>You make scheduled interest payments to token holders</li>
                                <li>At maturity, you return the principal to investors</li>
                            </ol>
                        </div>

                        <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all hover:scale-[1.02] shadow-lg shadow-blue-500/20">
                            Create Debt Offering
                        </Button>
                    </CardContent>
                </Card>

                {/* Sale (Equity) Option */}
                <Card
                    className="glass-panel border-white/10 bg-white/5 hover:border-primary/50 transition-all duration-300 cursor-pointer group relative overflow-hidden"
                    onClick={() => handleSelectType('sale')}
                >
                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <CardHeader className="pb-4">
                        <div className="flex items-start justify-between">
                            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                                <TrendingUp className="w-6 h-6 text-emerald-400" />
                            </div>
                            <span className="text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full">
                                Equity Instrument
                            </span>
                        </div>
                        <CardTitle className="text-xl mt-4 font-heading">Sale (Equity)</CardTitle>
                        <CardDescription className="text-muted-foreground">
                            Ownership stake with potential dividends based on performance
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-3">
                            <h4 className="text-sm font-medium text-white flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                Key Features
                            </h4>
                            <ul className="space-y-2 text-sm text-muted-foreground">
                                <li className="flex items-start gap-2">
                                    <Users className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                                    <span><strong className="text-white">Ownership Stake</strong> - Token represents equity in the venture</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <TrendingUp className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                                    <span><strong className="text-white">Variable Returns</strong> - Dividends based on actual performance</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <DollarSign className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                                    <span><strong className="text-white">No Fixed Payments</strong> - Flexibility in distribution timing</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <Shield className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                                    <span><strong className="text-white">Appreciation Potential</strong> - Token value can grow over time</span>
                                </li>
                            </ul>
                        </div>

                        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                            <p className="text-xs text-emerald-300">
                                <strong>Best for:</strong> Companies wanting to share ownership without fixed payment obligations. Ideal for startups, revenue-sharing projects, or real estate ventures.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <h4 className="text-sm font-medium text-white">How It Works</h4>
                            <ol className="space-y-1 text-xs text-muted-foreground list-decimal list-inside">
                                <li>You define the total token supply and price per token</li>
                                <li>Investors purchase tokens representing ownership</li>
                                <li>You distribute dividends when profits are available</li>
                                <li>Investors can trade tokens on secondary markets</li>
                            </ol>
                        </div>

                        <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-all hover:scale-[1.02] shadow-lg shadow-emerald-500/20">
                            Create Equity Offering
                        </Button>
                    </CardContent>
                </Card>
            </div>

            {/* Important Notice */}
            <Card className="glass-panel border-yellow-500/20 bg-yellow-500/5 animate-fade-in-up animate-delay-2">
                <CardContent className="p-4 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
                    <div className="text-sm">
                        <p className="text-yellow-300 font-medium">Important Regulatory Notice</p>
                        <p className="text-yellow-200/70 mt-1">
                            Security token offerings are subject to regulatory requirements. Ensure you have proper legal documentation
                            and comply with all applicable securities laws in your jurisdiction before proceeding.
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
