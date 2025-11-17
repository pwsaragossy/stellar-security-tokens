import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import type { LoginResponse } from '@/types';

interface AuthContextType {
  token: string | null;
  user: LoginResponse | null;
  login: (response: LoginResponse) => void;
  logout: () => void;
  isAuthenticated: boolean;
  role: 'investor' | 'company' | 'admin' | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useLocalStorage<string | null>('token', null);
  const [user, setUser] = useLocalStorage<LoginResponse | null>('user', null);

  const login = (response: LoginResponse) => {
    setToken(response.token);
    setUser(response);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  const isAuthenticated = !!token && !!user;
  const role = user?.role || null;

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        login,
        logout,
        isAuthenticated,
        role,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

