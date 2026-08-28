import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, useParams } from 'react-router-dom';
import {
  useReportsQuery,
  useGenerateReportMutation,
  useDownloadReportPdfMutation,
  useDownloadReportSarifMutation,
  useProjectsQuery,
} from '../../api/queries';
import { Report, ReportType } from '@sirius/types';
import { Input, Button, LoadingState, ErrorState } from '@sirius/ui';
import { GenerateReportDialog } from './GenerateReportDialog';
import { ReportList } from './ReportList';
import { ReportPreview } from './ReportPreview';
import { ReportSidebarInspector } from './ReportSidebarInspector';
import { FileText, Search, Plus } from 'lucide-react';

export const ReportsView: React.FC = () => {
  const [searchParams] = useSearchParams();

  const navigate = useNavigate();
  const { reportId: routeReportId } = useParams<{ reportId?: string }>();

  const paramId = searchParams.get('id') || routeReportId;
  const paramType = (searchParams.get('type') as ReportType) || 'technical';
  const paramScan = searchParams.get('scan') || 'scan-109283';
  const paramFramework = searchParams.get('framework') || 'pci-dss-4.0';

  const { data: projects = [] } = useProjectsQuery();
  const activeProject = projects[0];

  const { data: reports = [], isLoading, isError, refetch } = useReportsQuery(activeProject?.id);

  const generateReportMutation = useGenerateReportMutation();
  const downloadPdfMutation = useDownloadReportPdfMutation();
  const downloadSarifMutation = useDownloadReportSarifMutation();

  const [selectedReportId, setSelectedReportId] = useState<string | null>(paramId || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isGenerateOpen, setIsGenerateOpen] = useState(false);

  useEffect(() => {
    if (paramId) {
      setSelectedReportId(paramId);
    } else if (reports.length > 0 && !selectedReportId) {
      setSelectedReportId(reports[0].id);
    }
  }, [paramId, reports, selectedReportId]);

  if (isLoading) {
    return <LoadingState label="Loading security intelligence reports from FinSec Core..." />;
  }

  if (isError) {
    return <ErrorState title="Failed to Load Resource" description="Report repository data unavailable." onRetry={() => refetch()} />;
  }

  const filteredReports = reports.filter((r) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        r.id.toLowerCase().includes(q) ||
        r.title.toLowerCase().includes(q) ||
        r.type.toLowerCase().includes(q) ||
        r.scanId.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const selectedReport = filteredReports.find((r) => r.id === selectedReportId) || filteredReports[0] || null;

  const handleSelectReport = (report: Report) => {
    setSelectedReportId(report.id);
    navigate(`/reports/${report.id}`, { replace: true });
  };

  return (
    <div style={{ padding: '24px 28px', maxWidth: '1600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Workspace Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              backgroundColor: 'var(--color-primary-soft)',
              border: '1px solid rgba(14, 107, 74, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <FileText size={22} color="var(--color-primary)" />
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--color-primary)', textTransform: 'uppercase', marginBottom: '2px' }}>
              REPORTS
            </div>
            <h1 className="sirius-display" style={{ margin: 0, fontSize: '24px', fontWeight: 800 }}>
              Reports & Security Evidence
            </h1>
            <div className="sirius-caption">
              Generate audit-ready security intelligence evidence for engineering, compliance, and leadership.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Button variant="gradient" size="sm" onClick={() => setIsGenerateOpen(true)} leftIcon={<Plus size={14} />}>
            Generate Security Report
          </Button>

          <div style={{ width: '240px' }}>
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search report ID, title, type..."
              leftIcon={<Search size={14} />}
            />
          </div>
        </div>
      </div>

      {/* Landing Table */}
      <ReportList
        reports={filteredReports}
        selectedReportId={selectedReport?.id}
        onSelectReport={handleSelectReport}
        onDownloadPdf={(id) => downloadPdfMutation.mutateAsync(id)}
        onDownloadSarif={(id) => downloadSarifMutation.mutateAsync(id)}
      />

      {/* Document Detail Preview Workspace */}
      <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', height: '620px' }}>
        {/* Document Preview Surface */}
        <div style={{ flex: 1, minWidth: 0, height: '100%' }}>
          <ReportPreview report={selectedReport} />
        </div>

        {/* Right Inspector & Download Panel */}
        <ReportSidebarInspector
          report={selectedReport}
          onDownloadPdf={(id) => downloadPdfMutation.mutateAsync(id)}
          onDownloadSarif={(id) => downloadSarifMutation.mutateAsync(id)}
        />
      </div>

      {/* Generate Report Dialog */}
      <GenerateReportDialog
        isOpen={isGenerateOpen}
        onClose={() => setIsGenerateOpen(false)}
        initialType={paramType}
        initialScanId={paramScan}
        initialProjectId={activeProject?.id || 'prj-finsec-core-01'}
        initialFrameworkId={paramFramework}
        onSubmit={async (params) => {
          const generated = await generateReportMutation.mutateAsync(params);
          setSelectedReportId(generated.id);
          navigate(`/reports/${generated.id}`);
        }}
      />
    </div>
  );
};
