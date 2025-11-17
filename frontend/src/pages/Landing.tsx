import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, User, Shield } from 'lucide-react';

export function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-6 py-4">
          <h1 className="text-2xl font-bold">Stellar Security Tokens</h1>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold mb-4">
            RWA Tokenization Platform
          </h2>
        </div>

        {/* Portal Cards */}
        <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {/* Investor Portal */}
          <Card className="text-center">
            <CardHeader>
              <div className="mx-auto mb-4 p-3 bg-blue-100 dark:bg-blue-900/20 rounded-full w-fit">
                <User className="h-8 w-8 text-blue-600 dark:text-blue-400" />
              </div>
              <CardTitle>Investor Portal</CardTitle>
              <CardDescription>
                Portfolio management, investments, interest payments
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center gap-3">
                <Link to="/dev/login">
                  <Button>Login</Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Company Portal */}
          <Card className="text-center">
            <CardHeader>
              <div className="mx-auto mb-4 p-3 bg-purple-100 dark:bg-purple-900/20 rounded-full w-fit">
                <Building2 className="h-8 w-8 text-purple-600 dark:text-purple-400" />
              </div>
              <CardTitle>Company Portal</CardTitle>
              <CardDescription>
                Create offers, manage tokens, track investments
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center gap-3">
                <Link to="/dev/login">
                  <Button>Login</Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Admin Portal */}
          <Card className="text-center">
            <CardHeader>
              <div className="mx-auto mb-4 p-3 bg-red-100 dark:bg-red-900/20 rounded-full w-fit">
                <Shield className="h-8 w-8 text-red-600 dark:text-red-400" />
              </div>
              <CardTitle>Admin Portal</CardTitle>
              <CardDescription>
                Platform management, offer review, payment processing
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="flex justify-center">
                <Link to="/dev/login">
                  <Button>Login</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-card mt-16">
        <div className="container mx-auto px-6 py-8">
          <p className="text-center text-muted-foreground">
            Stellar Security Tokens - Dev Environment
          </p>
        </div>
      </footer>
    </div>
  );
}
