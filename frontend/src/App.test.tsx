import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import App from './App';

vi.mock('@/hooks/usePortfolio', () => ({
    usePortfolio: () => ({
        data: {
            totalBalance: 1000,
            activeInvestmentsCount: 5,
            pendingPayouts: 0,
            totalIncome: 100,
            currency: 'USD'
        },
        activity: [],
        loading: false,
        error: null
    })
}));

describe('App', () => {
    it('renders without crashing', () => {
        // Mock user in localStorage
        const mockUser = { id: 1, name: 'Test User', email: 'test@example.com' };
        localStorage.setItem('user', JSON.stringify(mockUser));
        localStorage.setItem('token', 'mock-token');

        render(<App />);
        expect(document.body).toBeDefined();

        // Remove manual cleanup to avoid race condition with effects
        // localStorage.clear(); 
    });
});
