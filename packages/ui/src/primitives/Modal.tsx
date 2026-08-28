import React, { ReactNode, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { modalAnimationVariants } from '@sirius/design-system';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: string;
  closeOnOutsideClick?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  maxWidth = '540px',
  closeOnOutsideClick = true,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {/* Overlay Scrim */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => closeOnOutsideClick && onClose()}
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'var(--bg-overlay)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
            }}
          />

          {/* Modal Content */}
          <motion.div
            variants={modalAnimationVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            role="dialog"
            aria-modal="true"
            style={{
              position: 'relative',
              width: '100%',
              maxWidth,
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: 'var(--color-bg-surface)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-2xl)',
              boxShadow: 'var(--shadow-modal)',
              zIndex: 1,
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border-hairline)' }}>
              {typeof title === 'string' ? <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>{title}</h3> : title || <div />}
              <button
                onClick={onClose}
                aria-label="Close dialog"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>{children}</div>

            {/* Footer */}
            {footer && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px', padding: '16px 24px', borderTop: '1px solid var(--border-hairline)', backgroundColor: 'var(--color-bg-surface-elevated)' }}>
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export const GlassModal: React.FC<ModalProps> = (props) => <Modal {...props} />;

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  position?: 'right' | 'left';
}

export const Drawer: React.FC<DrawerProps> = ({ isOpen, onClose, title, children, position = 'right' }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', justifyContent: position === 'right' ? 'flex-end' : 'flex-start' }}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{ position: 'absolute', inset: 0, backgroundColor: 'var(--bg-overlay)' }}
          />

          <motion.div
            initial={{ x: position === 'right' ? '100%' : '-100%' }}
            animate={{ x: 0, transition: { type: 'spring', damping: 25, stiffness: 250 } }}
            exit={{ x: position === 'right' ? '100%' : '-100%' }}
            style={{
              position: 'relative',
              width: '400px',
              height: '100%',
              backgroundColor: 'var(--color-bg-surface)',
              backdropFilter: 'blur(20px)',
              borderLeft: '1px solid var(--color-border)',
              display: 'flex',
              flexDirection: 'column',
              zIndex: 1,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px', borderBottom: '1px solid var(--border-hairline)' }}>
              {typeof title === 'string' ? <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>{title}</h3> : title}
              <button onClick={onClose} aria-label="Close drawer" style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
