import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GlassModal, Button, Badge } from '@sirius/ui';
import { Sparkles, Play, RotateCcw, ChevronRight } from 'lucide-react';


export interface DemoModeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DemoModeModal: React.FC<DemoModeModalProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);

  const demoSteps = [
    {
      step: 1,
      title: '1. Executive Security Dashboard',
      description: 'Inspect top-level security posture score (72.5/100), financial money-at-risk ($185,000), and critical vulnerability breakdown.',
      route: '/dashboard',
    },
    {
      step: 2,
      title: '2. Launch AST Security Scan',
      description: 'Trigger AST rule engine evaluation against PayKit Core API repository target branch main.',
      route: '/scans/new',
    },
    {
      step: 3,
      title: '3. Live Scan Streaming Console',
      description: 'Observe real-time WebSocket progress events streaming pipeline status, file AST parsing, and live gate failure alerts.',
      route: '/scans/scan-109283',
    },
    {
      step: 4,
      title: '4. Findings Explorer & Code Evidence',
      description: 'Inspect hardcoded JWT signing private key disclosure (fnd-88219) with redacted credentials and tabular line locations.',
      route: '/findings/fnd-88219',
    },
    {
      step: 5,
      title: '5. Cerebus AI Security Analyst',
      description: 'Review structured 5-section AI security analyst explanation covering exploitability, financial impact, and read-only diffs.',
      route: '/cerebus/fnd-88219',
    },
    {
      step: 6,
      title: '6. Attack Path Security Graph',
      description: 'Visualize multi-hop exploit propagation graph from public API Gateway through JWT disclosure to production database access.',
      route: '/attack-paths/ap-001',
    },
    {
      step: 7,
      title: '7. Compliance Posture & PCI DSS 4.0',
      description: 'Inspect automated PCI DSS Requirement 6.3.1 compliance mapping, control status, and evidence provenance.',
      route: '/compliance/pci-dss-4.0',
    },
    {
      step: 8,
      title: '8. Safe Remediation & Patch Approval',
      description: 'Review verified environment secret substitution diff, verifier status PASSED, and human approval gate.',
      route: '/remediation/fnd-88219',
    },
    {
      step: 9,
      title: '9. Audit Reports & SARIF 2.1.0 Export',
      description: 'Preview audit-ready Executive Briefing and download SARIF 2.1.0 JSON artifact with D-006 level mapping.',
      route: '/reports/rep-8812',
    },
  ];

  const handleGoToStep = (index: number) => {
    setCurrentStep(index);
    navigate(demoSteps[index].route);
  };

  const handleNext = () => {
    const nextIdx = (currentStep + 1) % demoSteps.length;
    handleGoToStep(nextIdx);
  };

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title="Hackathon Guided Walkthrough Mode"
      maxWidth="620px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(56, 189, 248, 0.1)', padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Sparkles size={20} color="var(--color-cyan)" />
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                PayKit Core API Hackathon Demo Story
              </div>
              <div className="sirius-caption">
                Deterministic 9-step guided walkthrough across all SIRIUS security command center surfaces.
              </div>
            </div>
          </div>
          <Badge variant="cyan" size="sm">
            DEMO MODE
          </Badge>
        </div>

        {/* Step List Progress */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflowY: 'auto', paddingRight: '4px' }}>
          {demoSteps.map((s, idx) => {
            const isActive = currentStep === idx;

            return (
              <div
                key={s.step}
                onClick={() => handleGoToStep(idx)}
                style={{
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: isActive ? 'rgba(56, 189, 248, 0.12)' : 'var(--bg-surface)',
                  border: `1px solid ${isActive ? 'rgba(56, 189, 248, 0.4)' : 'var(--border-hairline)'}`,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'all var(--transition-fast)',
                }}
              >
                <div>
                  <div style={{ fontSize: '13.5px', fontWeight: isActive ? 700 : 600, color: isActive ? 'var(--color-cyan)' : 'var(--text-primary)' }}>
                    {s.title}
                  </div>
                  <div className="sirius-caption" style={{ marginTop: '2px' }}>
                    {s.description}
                  </div>
                </div>

                <div style={{ marginLeft: '12px' }}>
                  {isActive ? (
                    <Badge variant="cyan" size="sm" icon={<Play size={10} />}>
                      ACTIVE
                    </Badge>
                  ) : (
                    <ChevronRight size={16} color="var(--text-dim)" />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal Controls */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-hairline)', paddingTop: '16px' }}>
          <Button variant="ghost" size="sm" onClick={() => handleGoToStep(0)} leftIcon={<RotateCcw size={13} />}>
            Restart Walkthrough
          </Button>

          <div style={{ display: 'flex', gap: '10px' }}>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Exit Walkthrough
            </Button>
            <Button variant="gradient" size="sm" onClick={handleNext} rightIcon={<ChevronRight size={14} />}>
              {currentStep === demoSteps.length - 1 ? 'Finish & Restart' : `Next: Step ${currentStep + 2}`}
            </Button>
          </div>
        </div>
      </div>
    </GlassModal>
  );
};
