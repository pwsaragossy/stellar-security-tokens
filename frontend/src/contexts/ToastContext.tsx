import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { ToastContainer } from '@/components/ui/toast';
import type { ToastProps, ToastType } from '@/components/ui/toast';

interface ToastData extends Omit<ToastProps, 'onClose'> {}

interface ToastContextType {
  showToast: (type: ToastType, title: string, description?: string, duration?: number) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (type: ToastType, title: string, description?: string, duration: number = 5000) => {
      const id = Math.random().toString(36).substring(7);
      setToasts((prev) => [...prev, { id, type, title, description, duration }]);
    },
    []
  );

  const success = useCallback((title: string, description?: string) => {
    showToast('success', title, description);
  }, [showToast]);

  const error = useCallback((title: string, description?: string) => {
    showToast('error', title, description);
  }, [showToast]);

  const warning = useCallback((title: string, description?: string) => {
    showToast('warning', title, description);
  }, [showToast]);

  const info = useCallback((title: string, description?: string) => {
    showToast('info', title, description);
  }, [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, success, error, warning, info }}>
      {children}
      <ToastContainer
        toasts={toasts.map((toast) => ({
          ...toast,
          onClose: removeToast,
        })) as ToastProps[]}
        onClose={removeToast}
      />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

