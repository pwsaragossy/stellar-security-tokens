import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { initSentry, SentryErrorBoundary } from './lib/sentry';

// Initialize Sentry error monitoring (must be before render)
initSentry();

// Force dark mode
document.documentElement.classList.add('dark');

// Fallback UI for error boundary
const ErrorFallback = () => (
  <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
    <div className="text-center">
      <h1 className="text-2xl font-bold text-white mb-4">Something went wrong</h1>
      <p className="text-slate-400 mb-6">
        We've been notified and are looking into it.
      </p>
      <button
        onClick={() => {
          localStorage.clear();
          sessionStorage.clear();
          window.location.href = '/';
        }}
        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        Go to Home
      </button>
    </div>
  </div>
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SentryErrorBoundary fallback={<ErrorFallback />}>
      <App />
    </SentryErrorBoundary>
  </StrictMode>
);
