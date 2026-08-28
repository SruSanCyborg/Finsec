import React from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAppStore } from '@sirius/state';
import { DesignSystemShowcase } from './DesignSystemShowcase';
import {
  BootSplash,
  WelcomeScreen,
  AuthScreen,
  ConnectProjectScreen,
  FirstScanPrimerScreen,
} from '../onboarding';
import { AppShell, RouteFrame } from '../shell';
import { DashboardView } from '../features/dashboard';
import { ProjectsGridView, ProjectDetailView } from '../features/projects';
import { ScansHistoryView, ScanConfigView, ScanDetailView } from '../features/scans';
import { FindingsExplorerView } from '../features/findings';
import { CerebusWorkspaceView } from '../features/cerebus';
import { RemediationWorkspaceView } from '../features/remediation';
import { AttackPathsView } from '../features/attack-paths';
import { ComplianceView } from '../features/compliance';
import { SuppressionsView, BaselinesView } from '../features/governance';
import { ReportsView } from '../features/reports';
import { SettingsView } from '../features/settings';



export const AppRoutes: React.FC = () => {


  const location = useLocation();
  const navigate = useNavigate();
  const {
    lifecyclePhase,
    setLifecyclePhase,
    hasCompletedOnboarding,
    completeOnboarding,
  } = useAppStore();

  // Route /design-system is independent QA laboratory
  if (location.pathname === '/design-system') {
    return (
      <Routes>
        <Route path="/design-system" element={<DesignSystemShowcase />} />
      </Routes>
    );
  }

  // Handle Onboarding Flow Phases if not complete
  if (!hasCompletedOnboarding && lifecyclePhase !== 'ready') {
    switch (lifecyclePhase) {
      case 'boot':
        return <BootSplash onComplete={() => setLifecyclePhase('onboarding_welcome')} />;

      case 'onboarding_welcome':
        return (
          <WelcomeScreen
            onNext={() => setLifecyclePhase('onboarding_auth')}
            onExploreDemo={() => {
              completeOnboarding();
              navigate('/dashboard');
            }}
          />
        );

      case 'onboarding_auth':
        return (
          <AuthScreen
            onNext={() => setLifecyclePhase('onboarding_project')}
            onBack={() => setLifecyclePhase('onboarding_welcome')}
          />
        );

      case 'onboarding_project':
        return (
          <ConnectProjectScreen
            onNext={() => setLifecyclePhase('onboarding_primer')}
            onBack={() => setLifecyclePhase('onboarding_auth')}
          />
        );

      case 'onboarding_primer':
        return (
          <FirstScanPrimerScreen
            onRunFirstScan={() => {
              completeOnboarding();
              navigate('/scans/new');
            }}
            onSkip={() => {
              completeOnboarding();
              navigate('/dashboard');
            }}
          />
        );

      default:
        return <BootSplash onComplete={() => setLifecyclePhase('onboarding_welcome')} />;
    }
  }

  // Render Persistent AppShell Frame for Main Product Routes
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardView />} />
        <Route path="/projects" element={<ProjectsGridView />} />
        <Route path="/projects/:projectId" element={<ProjectDetailView />} />
        <Route path="/scans" element={<ScansHistoryView />} />
        <Route path="/scans/new" element={<ScanConfigView />} />
        <Route path="/scans/:scanId" element={<ScanDetailView />} />
        <Route path="/findings" element={<FindingsExplorerView />} />
        <Route path="/findings/:findingId" element={<FindingsExplorerView />} />
        <Route path="/findings/:findingId/remediation" element={<RemediationWorkspaceView />} />
        <Route path="/remediation/:findingId" element={<RemediationWorkspaceView />} />
        <Route path="/cerebus" element={<CerebusWorkspaceView />} />
        <Route path="/cerebus/:findingId" element={<CerebusWorkspaceView />} />
        <Route path="/attack-paths" element={<AttackPathsView />} />
        <Route path="/attack-paths/:pathId" element={<AttackPathsView />} />
        <Route path="/compliance" element={<ComplianceView />} />
        <Route path="/compliance/:frameworkId" element={<ComplianceView />} />
        <Route path="/suppressions" element={<SuppressionsView />} />
        <Route path="/baselines" element={<BaselinesView />} />
        <Route path="/reports" element={<ReportsView />} />
        <Route path="/reports/:reportId" element={<ReportsView />} />

        <Route path="/settings" element={<SettingsView />} />
        <Route path="/settings/:section" element={<SettingsView />} />

        <Route
          path="*"
          element={
            <RouteFrame
              title="Route Not Found"
              description="The requested page route shell does not exist."
              phaseLabel="404 Fallback"
            />
          }
        />
      </Routes>
    </AppShell>
  );
};
