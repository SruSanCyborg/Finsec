"""Neon schema — 15 tables from the PRD DDL.

Enumerations mirror the wire contract exactly (see contract/openapi.yaml on the
CLI branch). UUID PKs via gen_random_uuid(), TIMESTAMPTZ throughout.
"""

SCHEMA_SQL = """
-- UUID generation (Postgres 13+ has it built in via pgcrypto in Neon)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Migrate pre-unique-constraint tables (empty at this point, so safe to rebuild)
DROP TABLE IF EXISTS api_keys;
DROP TABLE IF EXISTS policies;

CREATE TABLE IF NOT EXISTS tenants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL DEFAULT '',
  role          TEXT NOT NULL DEFAULT 'member'
                CHECK (role IN ('owner','admin','analyst','member','viewer')),
  mfa           BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  repo_url      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS api_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  prefix        TEXT NOT NULL,
  key_hash      TEXT NOT NULL UNIQUE,  -- sha256 of the raw secret; never store raw
  scopes        TEXT[] NOT NULL DEFAULT '{}',
  expires_at    TIMESTAMPTZ,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS policies (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            UUID NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  fail_on_severity      TEXT NOT NULL DEFAULT 'high'
                        CHECK (fail_on_severity IN ('critical','high','medium','low','info')),
  max_new_findings      INTEGER NOT NULL DEFAULT 0,
  require_no_verified_secrets BOOLEAN NOT NULL DEFAULT TRUE,
  min_compliance_score  NUMERIC(5,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS scans (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status              TEXT NOT NULL DEFAULT 'queued'
                      CHECK (status IN ('queued','running','completed','failed','canceled')),
  source              TEXT NOT NULL DEFAULT 'inline'
                      CHECK (source IN ('upload','git','inline')),
  trigger             TEXT NOT NULL DEFAULT 'manual'
                      CHECK (trigger IN ('manual','ci','webhook','schedule')),
  git_ref             TEXT,
  commit_sha          TEXT,
  baseline_commit     TEXT,
  diff_aware          BOOLEAN NOT NULL DEFAULT FALSE,
  rulesets            TEXT[] NOT NULL DEFAULT '{p/fintech-core}',
  severity_threshold  TEXT NOT NULL DEFAULT 'high'
                      CHECK (severity_threshold IN ('critical','high','medium','low','info')),
  fail_on             TEXT NOT NULL DEFAULT 'all'
                      CHECK (fail_on IN ('all','new','verified-secrets')),
  compliance_score    NUMERIC(5,2),
  money_at_risk_inr   BIGINT,
  exit_code           INTEGER,
  started_at          TIMESTAMPTZ,
  finished_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS findings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id             UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  file                TEXT NOT NULL,
  line                INTEGER NOT NULL,
  end_line            INTEGER,
  col                 INTEGER,
  severity            TEXT NOT NULL
                      CHECK (severity IN ('critical','high','medium','low','info')),
  rule_id             TEXT NOT NULL,
  category            TEXT NOT NULL
                      CHECK (category IN ('secrets','auth','injection','pii','crypto','logging','ratelimit','supplychain')),
  compliance_ref      JSONB NOT NULL DEFAULT '[]',
  message             TEXT NOT NULL,
  snippet             TEXT,
  fingerprint         TEXT,
  baseline_state      TEXT NOT NULL DEFAULT 'new'
                      CHECK (baseline_state IN ('new','unchanged','absent')),
  validity            TEXT NOT NULL DEFAULT 'unknown'
                      CHECK (validity IN ('verified_live','inactive','unknown')),
  money_at_risk_inr   BIGINT NOT NULL DEFAULT 0,
  suppressed          BOOLEAN NOT NULL DEFAULT FALSE,
  triage_state        TEXT NOT NULL DEFAULT 'open'
                      CHECK (triage_state IN ('open','accepted','dismissed','suppressed')),
  taint               TEXT,
  fix_action          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_findings_scan ON findings(scan_id);
CREATE INDEX IF NOT EXISTS idx_findings_fingerprint ON findings(fingerprint);

CREATE TABLE IF NOT EXISTS fix_suggestions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id        UUID NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
  action            TEXT NOT NULL,
  target            TEXT,
  confidence        NUMERIC(4,3),
  diff              TEXT NOT NULL,
  verifier_status   TEXT NOT NULL DEFAULT 'pass'
                    CHECK (verifier_status IN ('pass','fail','escalated')),
  escalate          BOOLEAN NOT NULL DEFAULT FALSE,
  accepted          BOOLEAN NOT NULL DEFAULT FALSE,
  generated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS suppressions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  rule_id       TEXT,
  path_glob     TEXT,
  fingerprint   TEXT,
  reason        TEXT NOT NULL,
  expires_at    TIMESTAMPTZ,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS baselines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  commit_sha    TEXT NOT NULL,
  scan_id       UUID REFERENCES scans(id) ON DELETE SET NULL,
  fingerprints  JSONB NOT NULL DEFAULT '[]',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id       UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  format        TEXT NOT NULL DEFAULT 'json'
                CHECK (format IN ('pdf','json','sarif')),
  uri           TEXT,
  jws_signature TEXT,
  signed_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rules (
  id            TEXT PRIMARY KEY,
  version       TEXT NOT NULL DEFAULT '1',
  enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  category      TEXT NOT NULL,
  severity      TEXT NOT NULL
                CHECK (severity IN ('critical','high','medium','low','info')),
  message       TEXT NOT NULL,
  languages     JSONB NOT NULL DEFAULT '[]',
  compliance_ref JSONB NOT NULL DEFAULT '[]',
  fix_action    TEXT,
  suppress_token TEXT,
  yaml_body     TEXT
);

CREATE TABLE IF NOT EXISTS sbom_components (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id       UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  purl          TEXT NOT NULL,
  version       TEXT,
  risk_score    NUMERIC(6,2),
  behaviors     JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor         UUID REFERENCES users(id),
  action        TEXT NOT NULL,
  target        TEXT,
  meta          JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  body          TEXT NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'system'
                CHECK (kind IN ('alert','scan','team','system','ai')),
  read          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
"""
