import { Component, ErrorInfo, ReactNode } from 'react';
import { ShieldAlert, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Uncaught error in SIRIUS GUI component tree:', error, errorInfo);
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          backgroundColor: 'var(--bg-void)',
          color: 'var(--text-primary)',
          padding: '24px',
          textAlign: 'center'
        }}>
          <div className="sirius-glass-raised" style={{ padding: '32px', maxWidth: '480px' }}>
            <ShieldAlert size={48} color="var(--color-red)" style={{ marginBottom: '16px' }} />
            <h2 style={{ margin: '0 0 12px 0', fontSize: '20px', fontWeight: 600 }}>
              SIRIUS GUI Runtime Exception
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '20px' }}>
              {this.state.error?.message || 'An unexpected client error occurred inside the UI shell.'}
            </p>
            <button
              onClick={this.handleReset}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 20px',
                backgroundColor: 'rgba(56, 189, 248, 0.15)',
                color: 'var(--color-cyan)',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '14px'
              }}
            >
              <RefreshCw size={16} /> Recover State
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
