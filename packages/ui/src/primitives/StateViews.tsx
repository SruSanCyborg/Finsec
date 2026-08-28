import React, { ReactNode } from 'react';
import { ShieldCheck, ShieldAlert, RefreshCw } from 'lucide-react';
import { Spinner } from './Feedback';
import { Button } from './Button';

export interface StateViewProps {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}

export const EmptyState: React.FC<StateViewProps> = ({
  title,
  description = 'No items found matching your current filter criteria.',
  action,
  icon = <ShieldCheck size={40} color="var(--text-dim)" />,
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', textAlign: 'center' }}>
      <div style={{ marginBottom: '16px' }}>{icon}</div>
      <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>{title}</h3>
      <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '360px' }}>{description}</p>
      {action}
    </div>
  );
};

export const LoadingState: React.FC<{ label?: string }> = ({ label = 'Loading security data...' }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', gap: '12px' }}>
      <Spinner size={32} />
      <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{label}</span>
    </div>
  );
};

export interface ErrorStateProps extends StateViewProps {
  onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Failed to Load Resource',
  description = 'Unable to fetch data from FinSec Core API.',
  onRetry,
  action,
  icon = <ShieldAlert size={40} color="var(--color-violet)" />,
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', textAlign: 'center' }}>
      <div style={{ marginBottom: '16px' }}>{icon}</div>
      <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>{title}</h3>
      <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '360px' }}>{description}</p>
      {action || (onRetry && <Button variant="ghost" leftIcon={<RefreshCw size={14} />} onClick={onRetry}>Retry Request</Button>)}
    </div>
  );
};
