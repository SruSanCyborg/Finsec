import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'warning' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  durationMs?: number;
}

type ToastListener = (toasts: ToastMessage[]) => void;
let toastListeners: ToastListener[] = [];
let toastQueue: ToastMessage[] = [];

export const toast = {
  show: (type: ToastType, title: string, message?: string, durationMs = 4000) => {
    const newToast: ToastMessage = {
      id: `toast-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      type,
      title,
      message,
      durationMs,
    };
    toastQueue = [newToast, ...toastQueue];
    toastListeners.forEach((l) => l(toastQueue));

    if (durationMs > 0) {
      setTimeout(() => {
        toast.dismiss(newToast.id);
      }, durationMs);
    }
  },
  success: (title: string, message?: string) => toast.show('success', title, message),
  warning: (title: string, message?: string) => toast.show('warning', title, message),
  error: (title: string, message?: string) => toast.show('error', title, message),
  info: (title: string, message?: string) => toast.show('info', title, message),
  dismiss: (id: string) => {
    toastQueue = toastQueue.filter((t) => t.id !== id);
    toastListeners.forEach((l) => l(toastQueue));
  },
};

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    toastListeners.push(setToasts);
    return () => {
      toastListeners = toastListeners.filter((l) => l !== setToasts);
    };
  }, []);

  const getIcon = (type: ToastType) => {
    switch (type) {
      case 'success':
        return <CheckCircle2 size={18} color="var(--color-emerald)" />;
      case 'warning':
        return <AlertTriangle size={18} color="var(--color-amber)" />;
      case 'error':
        return <AlertCircle size={18} color="var(--color-red)" />;
      default:
        return <Info size={18} color="var(--color-primary)" />;
    }
  };

  return (
    <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 20000, display: 'flex', flexDirection: 'column', gap: '8px', pointerEvents: 'none' }}>
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            style={{
              pointerEvents: 'auto',
              minWidth: '280px',
              maxWidth: '380px',
              backgroundColor: 'var(--color-bg-surface)',
              backdropFilter: 'blur(16px)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-raised)',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
            }}
          >
            {getIcon(t.type)}
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>{t.title}</div>
              {t.message && <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{t.message}</div>}
            </div>
            <button
              onClick={() => toast.dismiss(t.id)}
              aria-label="Dismiss notification"
              style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 0 }}
            >
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
