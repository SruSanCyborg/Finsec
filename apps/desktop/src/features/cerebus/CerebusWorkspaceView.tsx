import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useFindingsQuery, useProjectsQuery, useFixProposalQuery, useAskCerebusMutation } from '../../api/queries';
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

  const selectedFinding = findings.find((f) => f.id === findingId) || null;
  const selectedProject = projects.find((p) => p.id === (projectId || selectedFinding?.projectId)) || projects[0];

  // `engine/fix.ts`'s template engine and verifier, always tried first — a
  // model only gets asked when nothing there covers the rule. See `engine/ask.ts`
  // for the separate, real Groq-backed Q&A path the composer below talks to.
  const fixQuery = useFixProposalQuery({
    scanId: selectedFinding?.scanId,
    findingId: selectedFinding?.id,
    projectId: selectedProject?.id,
    finding: selectedFinding ?? undefined,
  });
  const askMutation = useAskCerebusMutation();

  const [messages, setMessages] = useState<CerebusMessage[]>([]);

  useEffect(() => {
    if (!selectedFinding) {
      setMessages([
        {
          id: 'msg-welcome',
          role: 'assistant',
          content: 'Select a finding to see the fix Cerebus built for it, or ask it a question about one.',
          state: 'complete',
          timestamp: new Date().toISOString(),
        },
      ]);
      return;
    }

    const userMsg: CerebusMessage = {
      id: `msg-${selectedFinding.id}-user`,
      role: 'user',
      content: `${selectedFinding.ruleId} — ${selectedFinding.title} (${selectedFinding.filePath}:${selectedFinding.startLine})`,
      state: 'complete',
      timestamp: new Date().toISOString(),
    };

    if (fixQuery.isLoading) {
      setMessages([userMsg]);
      return;
    }

    if (fixQuery.isError) {
      setMessages([
        userMsg,
        {
          id: `msg-${selectedFinding.id}-error`,
          role: 'assistant',
          content: fixQuery.error instanceof Error ? fixQuery.error.message : 'No fix template covers this rule yet.',
          state: 'error',
          timestamp: new Date().toISOString(),
        },
      ]);
      return;
    }

    if (fixQuery.data) {
      const fix = fixQuery.data;
      setMessages([
        userMsg,
        {
          id: `msg-${selectedFinding.id}-fix`,
          role: 'assistant',
          content:
            `${fix.title}. ${fix.summary}. ` +
            `Verifier: ${fix.verifierStatus}${fix.verifierMessage ? ` — ${fix.verifierMessage}` : ''}.`,
          state: 'complete',
          timestamp: new Date().toISOString(),
        },
      ]);
    }
  }, [selectedFinding, fixQuery.isLoading, fixQuery.isError, fixQuery.data, fixQuery.error]);

  const handleAsk = (question: string) => {
    // Every complete user/assistant turn so far, in order — this is what
    // gives the chat memory: the daemon threads it straight into the model
    // call as real conversation, not a fresh, context-free question each time.
    const history = messages
      .filter((m): m is CerebusMessage & { role: 'user' | 'assistant' } =>
        (m.role === 'user' || m.role === 'assistant') && m.state === 'complete',
      )
      .map((m) => ({ role: m.role, content: m.content }));

    const userMsg: CerebusMessage = {
      id: `msg-ask-${Date.now()}-user`,
      role: 'user',
      content: question,
      state: 'complete',
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    askMutation.mutate(
      {
        question,
        history,
        projectId: selectedProject?.id,
        ...(selectedFinding ? { finding: { scanId: selectedFinding.scanId, id: selectedFinding.id } } : {}),
      },
      {
        onSuccess: (answer) => {
          setMessages((prev) => [
            ...prev,
            {
              id: `msg-ask-${Date.now()}-assistant`,
              role: 'assistant',
              content: answer,
              state: 'complete',
              timestamp: new Date().toISOString(),
            },
          ]);
        },
        onError: (err) => {
          setMessages((prev) => [
            ...prev,
            {
              id: `msg-ask-${Date.now()}-error`,
              role: 'assistant',
              content: err instanceof Error ? err.message : 'Cerebus could not answer that.',
              state: 'error',
              timestamp: new Date().toISOString(),
            },
          ]);
        },
      },
    );
  };

  const clearSession = () => {
    setMessages([
      {
        id: `msg-welcome-${Date.now()}`,
        role: 'assistant',
        content: 'Session cleared. Select a finding to see the fix Cerebus built for it.',
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
                status={fixQuery.isFetching ? 'Scanning' : 'Success'}
                label={fixQuery.isFetching ? 'BUILDING FIX' : 'READY'}
              />
            </div>
          </div>
        </div>

        <Button variant="ghost" size="sm" leftIcon={<RefreshCw size={14} />} onClick={clearSession}>
          Clear Session
        </Button>
      </div>

      {/* Building Banner */}
      {fixQuery.isFetching && (
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
            <span style={{ fontWeight: 600 }}>Cerebus is building and verifying a fix...</span>
          </div>
          <span style={{ fontSize: '11px', fontFamily: 'var(--font-code)', opacity: 0.8 }}>TEMPLATE, OR MODEL IF NONE COVERS IT</span>
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

          {/* Ask Cerebus a real question, or re-run the fix for the selected finding */}
          <CerebusComposer
            onAsk={handleAsk}
            onRerunFix={() => fixQuery.refetch()}
            isAsking={askMutation.isPending}
            isBuildingFix={fixQuery.isFetching}
            hasFindingContext={Boolean(selectedFinding)}
          />
        </div>

        {/* Right Collapsible Security Context Panel */}
        <CerebusContextPanel finding={selectedFinding} project={selectedProject ?? null} />
      </div>
    </div>
  );
};
