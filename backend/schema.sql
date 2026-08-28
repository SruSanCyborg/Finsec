CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_org_id TEXT UNIQUE,
  name TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  clerk_user_id TEXT UNIQUE,
  email TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'member',
  mfa BOOLEAN NOT NULL DEFAULT false,
  on_call BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active',
  phone TEXT,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL UNIQUE,
  secret_hash TEXT,
  scopes TEXT[] NOT NULL DEFAULT '{scans:read,findings:read,findings:write}',
  status TEXT NOT NULL DEFAULT 'active',
  created_by TEXT NOT NULL DEFAULT 'system',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  repo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  severity_floor TEXT NOT NULL DEFAULT 'high',
  fail_on_severity TEXT NOT NULL DEFAULT 'high',
  max_new_findings INT NOT NULL DEFAULT 0,
  require_no_verified_secrets BOOLEAN NOT NULL DEFAULT true,
  min_compliance_score NUMERIC(5,2) NOT NULL DEFAULT 80,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  source TEXT NOT NULL DEFAULT 'git',
  target TEXT NOT NULL DEFAULT '.',
  trigger TEXT NOT NULL DEFAULT 'manual',
  initiated_by TEXT NOT NULL DEFAULT 'api',
  compliance_score NUMERIC(5,2),
  money_at_risk_inr BIGINT NOT NULL DEFAULT 0,
  counts JSONB NOT NULL DEFAULT '{}',
  exit_code INT,
  total_files INT,
  findings_count INT NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  scan_id UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  file TEXT NOT NULL,
  line INT NOT NULL DEFAULT 1,
  end_line INT,
  col INT,
  severity TEXT NOT NULL DEFAULT 'medium',
  rule_id TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'config',
  compliance_ref JSONB NOT NULL DEFAULT '[]',
  message TEXT NOT NULL,
  snippet TEXT,
  fingerprint TEXT,
  baseline_state TEXT NOT NULL DEFAULT 'new',
  validity TEXT,
  money_at_risk_inr BIGINT NOT NULL DEFAULT 0,
  triage_state TEXT NOT NULL DEFAULT 'open',
  suppressed BOOLEAN NOT NULL DEFAULT false,
  fix_action TEXT,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fix_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id UUID NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  diff TEXT NOT NULL DEFAULT '',
  verifier_status TEXT NOT NULL DEFAULT 'pending',
  accepted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS suppressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  rule_id TEXT,
  path_glob TEXT,
  fingerprint TEXT,
  reason TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  created_by TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS baselines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  commit_sha TEXT NOT NULL,
  fingerprints JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  scan_id UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  format TEXT NOT NULL DEFAULT 'pdf',
  compliance_score NUMERIC(5,2),
  counts JSONB NOT NULL DEFAULT '{}',
  money_at_risk_inr BIGINT NOT NULL DEFAULT 0,
  generated_by TEXT NOT NULL DEFAULT 'sirius',
  bytes INT NOT NULL DEFAULT 0,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rules (
  id TEXT PRIMARY KEY,
  version INT NOT NULL DEFAULT 1,
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  languages TEXT[] NOT NULL DEFAULT '{python}',
  message TEXT NOT NULL,
  compliance JSONB NOT NULL DEFAULT '{}',
  cwe TEXT[] NOT NULL DEFAULT '{}',
  fix_action TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS sbom_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  purl TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '',
  risk_score NUMERIC(4,2) NOT NULL DEFAULT 0,
  behaviors JSONB NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT '',
  meta TEXT
);

CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'messaging',
  description TEXT NOT NULL DEFAULT '',
  connected BOOLEAN NOT NULL DEFAULT false,
  events INT NOT NULL DEFAULT 0,
  config JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS call_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'critical',
  recipient TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  policy TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ringing',
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at TIMESTAMPTZ,
  finding_id UUID REFERENCES findings(id) ON DELETE SET NULL,
  transcript TEXT[] NOT NULL DEFAULT '{}',
  duration_sec INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'system',
  read BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS attack_paths (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  node_ids TEXT[] NOT NULL DEFAULT '{}',
  probability NUMERIC(5,4) NOT NULL DEFAULT 0,
  impact_usd BIGINT NOT NULL DEFAULT 0,
  techniques TEXT[] NOT NULL DEFAULT '{}',
  blocked BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'service',
  criticality INT NOT NULL DEFAULT 1,
  exposure TEXT NOT NULL DEFAULT 'internal'
);

CREATE INDEX IF NOT EXISTS idx_findings_scan ON findings(scan_id);
CREATE INDEX IF NOT EXISTS idx_findings_org ON findings(org_id);
CREATE INDEX IF NOT EXISTS idx_findings_fingerprint ON findings(fingerprint);
CREATE INDEX IF NOT EXISTS idx_scans_org ON scans(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_org ON audit_log(org_id, at DESC);
