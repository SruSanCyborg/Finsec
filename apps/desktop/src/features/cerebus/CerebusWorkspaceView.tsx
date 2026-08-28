import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useFindingsQuery, useProjectsQuery, useCerebusMutation } from '../../api/queries';
import { CerebusMessage } from '@sirius/types';
import { StatusPulse, Button } from '@sirius/ui';
import { CerebusContextPanel } from './CerebusContextPanel';
import { CerebusMessageCard } from './CerebusMessageCard';
import { CerebusComposer } from './CerebusComposer';
import { Cpu, RefreshCw } from 'lucide-react';

export const CerebusWorkspaceView: React.FC = () => {
  const [searchParams] = useSearchParams();
  const findingId = searchParams.get('finding') || undefined;
  const projectId = searchParams.get('project') || undefined;

  const { data: findings = [] } = useFindingsQuery();
  const { data: projects = [] } = useProjectsQuery();
  const cerebusMutation = useCerebusMutation();

  const selectedFinding = findings.find((f) => f.id === findingId) || null;
  const selectedProject = projects.find((p) => p.id === (projectId || selectedFinding?.projectId)) || projects[0];

  const [messages, setMessages] = useState<CerebusMessage[]>([]);

  const mutateCerebus = cerebusMutation.mutate;

  // Initial welcome or finding context analysis load
  useEffect(() => {
    if (selectedFinding) {
      const initialUserMsg: CerebusMessage = {
        id: `msg-${Date.now()}-user`,
        role: 'user',
        content: `Analyze finding ${selectedFinding.ruleId} (${selectedFinding.title}) in ${selectedFinding.filePath}:${selectedFinding.startLine}.`,
        state: 'complete',
        timestamp: new Date().toISOString(),
      };

      setMessages([initialUserMsg]);

      // Automatically trigger initial analysis for target finding
      mutateCerebus(
        { findingId: selectedFinding.id, query: 'Analyze finding' },
        {
          onSuccess: (res) => {
            const assistantMsg: CerebusMessage = {
              id: `msg-${Date.now()}-assistant`,
              role: 'assistant',
              content: res.message,
              response: res,
              state: 'complete',
              timestamp: new Date().toISOString(),
            };
            setMessages((prev) => [...prev, assistantMsg]);
          },
        }
      );
    } else {
      setMessages([
        {
          id: 'msg-welcome',
          role: 'assistant',
          content: `Welcome to Cerebus AI Security Analyst workspace. I am ready to evaluate repository risks, explain technical vulnerabilities, and generate read-only remediation proposals for your codebase.`,
          state: 'complete',
          timestamp: new Date().toISOString(),
        },
      ]);
    }
  }, [findingId, selectedFinding, mutateCerebus]);


  const handleSendMessage = (text: string) => {
    const userMsg: CerebusMessage = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content: text,
      state: 'complete',
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);

    cerebusMutation.mutate(
      { findingId: selectedFinding?.id, query: text, projectId: selectedProject?.id },
      {
        onSuccess: (res) => {
          const assistantMsg: CerebusMessage = {
            id: `msg-${Date.now()}-assistant`,
            role: 'assistant',
            content: res.message,
            response: res,
            state: 'complete',
            timestamp: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, assistantMsg]);
        },
      }
    );
  };

  const clearSession = () => {
    setMessages([
      {
        id: `msg-welcome-${Date.now()}`,
        role: 'assistant',
        content: `Session cleared. Ask Cerebus anything about workspace security or select a finding to begin context analysis.`,
        state: 'complete',
        timestamp: new Date().toISOString(),
      },
    ]);
  };

  return (
    <div style={{ padding: '24px 28px', maxWidth: '1600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px', height: 'calc(100vh - 120px)' }}>
      {/* Analyst Workspace Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              backgroundColor: 'var(--color-primary-soft)',
              border: '1px solid rgba(14, 107, 74, 0.2)',
              boxShadow: 'var(--shadow-small)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Cpu size={24} color="var(--color-primary)" />
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--color-primary)', textTransform: 'uppercase', marginBottom: '2px' }}>
              CEREBUS INTELLIGENCE
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 className="sirius-display" style={{ margin: 0, fontSize: '24px', fontWeight: 800 }}>
                Cerebus Analyst Workspace
              </h1>
              {selectedFinding ? (
                <div style={{ fontSize: '11px', fontFamily: 'var(--font-code)', padding: '2px 8px', borderRadius: 'var(--radius-pill)', backgroundColor: 'var(--color-primary-soft)', color: 'var(--color-primary)', border: '1px solid rgba(14, 107, 74, 0.2)', fontWeight: 600 }}>
                  Context: {selectedFinding.id} ({selectedFinding.ruleId})
                </div>
              ) : (
                <div style={{ fontSize: '11px', fontFamily: 'var(--font-code)', padding: '2px 8px', borderRadius: 'var(--radius-pill)', backgroundColor: 'var(--color-bg-surface-subtle)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)', fontWeight: 600 }}>
                  Project: {selectedProject?.name || 'finsec-core'}
                </div>
              )}
              <StatusPulse
                status={cerebusMutation.isPending ? 'Scanning' : 'Success'}
                label={cerebusMutation.isPending ? 'ANALYZING' : 'READY'}
              />
            </div>
          </div>
        </div>

        <Button variant="ghost" size="sm" leftIcon={<RefreshCw size={14} />} onClick={clearSession}>
          Clear Session
        </Button>
      </div>

      {/* Analyzing Banner */}
      {cerebusMutation.isPending && (
        <div
          style={{
            padding: '12px 18px',
            backgroundColor: 'var(--color-primary-soft)',
            border: '1px solid rgba(14, 107, 74, 0.2)',
            borderRadius: 'var(--radius-lg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '13px',
            color: 'var(--color-primary)',
            boxShadow: 'var(--shadow-small)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Cpu size={18} className="sirius-spin" />
            <span style={{ fontWeight: 600 }}>Cerebus is analyzing security context & synthesizing remediation plan...</span>
          </div>
          <span style={{ fontSize: '11px', fontFamily: 'var(--font-code)', opacity: 0.8 }}>EVALUATING AST & RISK EXPOSURE</span>
        </div>
      )}

      {/* Workspace Split Layout */}
      <div style={{ display: 'flex', gap: '20px', flex: 1, minHeight: 0 }}>
        {/* Left Conversation Stream & Composer */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
          {/* Messages Stream */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              paddingRight: '8px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            {/* Empty State Banner if no active finding selected */}
            {!selectedFinding && (
              <div
                style={{
                  padding: '24px',
                  borderRadius: 'var(--radius-xl)',
                  backgroundColor: 'var(--color-bg-surface)',
                  border: '1px solid var(--color-border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Cpu size={20} color="var(--color-primary)" />
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>
                    Understand the security story behind a finding.
                  </h3>
                </div>
                <p className="sirius-body-sm" style={{ color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.6 }}>
                  Cerebus performs automated root-cause analysis, evaluates financial exposure, traces cross-service attack paths, and constructs verified read-only remediation proposals.
                </p>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: 'var(--radius-pill)', backgroundColor: 'var(--color-primary-soft)', color: 'var(--color-primary)', border: '1px solid rgba(14, 107, 74, 0.2)' }}>
                    Root Cause Analysis
                  </span>
                  <span style={{ fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: 'var(--radius-pill)', backgroundColor: 'var(--color-primary-soft)', color: 'var(--color-primary)', border: '1px solid rgba(14, 107, 74, 0.2)' }}>
                    Technical Impact
                  </span>
                  <span style={{ fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: 'var(--radius-pill)', backgroundColor: 'var(--color-primary-soft)', color: 'var(--color-primary)', border: '1px solid rgba(14, 107, 74, 0.2)' }}>
                    Attack Path Context
                  </span>
                  <span style={{ fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: 'var(--radius-pill)', backgroundColor: 'var(--color-primary-soft)', color: 'var(--color-primary)', border: '1px solid rgba(14, 107, 74, 0.2)' }}>
                    Remediation Context
                  </span>
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <CerebusMessageCard key={msg.id} message={msg} />
            ))}
          </div>

          {/* Prompt Composer */}
          <CerebusComposer
            onSend={handleSendMessage}
            isLoading={cerebusMutation.isPending}
            hasFindingContext={Boolean(selectedFinding)}
          />
        </div>

        {/* Right Collapsible Security Context Panel */}
        <CerebusContextPanel finding={selectedFinding} projectName={selectedProject?.name} />
      </div>
    </div>
  );
};
