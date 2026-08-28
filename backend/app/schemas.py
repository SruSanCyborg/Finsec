"""Pydantic request/response models mirroring the OpenAPI contract."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Severity = Literal["critical", "high", "medium", "low", "info"]
Category = Literal["secrets", "auth", "injection", "pii", "crypto", "logging", "ratelimit", "supplychain"]
ScanStatus = Literal["queued", "running", "completed", "failed", "canceled"]
ScanSource = Literal["upload", "git", "inline"]
ScanTrigger = Literal["manual", "ci", "webhook", "schedule"]
BaselineState = Literal["new", "unchanged", "absent"]
Validity = Literal["verified_live", "inactive", "unknown"]
VerifierStatus = Literal["pass", "fail", "escalated"]
FailOn = Literal["all", "new", "verified-secrets"]
TriageState = Literal["open", "accepted", "dismissed", "suppressed"]
Role = Literal["owner", "admin", "analyst", "member", "viewer"]


class Problem(BaseModel):
    type: str | None = None
    title: str
    status: int
    detail: str | None = None
    instance: str | None = None
    code: str | None = None


class SeverityCounts(BaseModel):
    critical: int = 0
    high: int = 0
    medium: int = 0
    low: int = 0
    info: int = 0


class ScanCreate(BaseModel):
    project_id: str
    source: ScanSource = "inline"
    git_ref: str | None = None
    commit_sha: str | None = None
    baseline_commit: str | None = None
    diff_aware: bool = False
    rulesets: list[str] = ["p/fintech-core"]
    policy_id: str | None = None
    validate_secrets: bool = False
    severity_threshold: Severity = "high"
    fail_on: FailOn = "all"
    target: str | None = None  # path to scan (defaults to CWD)


class Scan(BaseModel):
    id: str
    project_id: str
    status: ScanStatus
    source: ScanSource = "inline"
    trigger: ScanTrigger = "manual"
    git_ref: str | None = None
    commit_sha: str | None = None
    baseline_commit: str | None = None
    compliance_score: float | None = None
    money_at_risk_inr: int | None = None
    counts: SeverityCounts = Field(default_factory=SeverityCounts)
    exit_code: int | None = None
    started_at: str | None = None
    finished_at: str | None = None
    created_at: str


class Finding(BaseModel):
    id: str
    scan_id: str
    file: str
    line: int
    end_line: int | None = None
    col: int | None = None
    severity: Severity
    rule_id: str
    category: Category
    compliance_ref: list[str] = []
    message: str
    snippet: str | None = None
    fingerprint: str | None = None
    baseline_state: BaselineState = "new"
    validity: Validity = "unknown"
    money_at_risk_inr: int | None = None
    suppressed: bool = False
    triage_state: TriageState = "open"
    fix_action: str | None = None
    taint: str | None = None


class FindingPage(BaseModel):
    items: list[Finding]
    next_cursor: str | None = None
    total: int


class TriageUpdate(BaseModel):
    triage_state: TriageState
    reason: str | None = None
    expires_at: str | None = None


class FixSuggestion(BaseModel):
    id: str
    finding_id: str
    action: str
    target: str | None = None
    confidence: float | None = None
    diff: str
    verifier_status: VerifierStatus = "pass"
    escalate: bool = False
    generated_at: str


class Rule(BaseModel):
    id: str
    version: str = "1"
    enabled: bool = True
    category: Category
    severity: Severity
    message: str
    languages: list[str] = []
    compliance_ref: list[str] = []
    fix_action: str | None = None
    suppress_token: str | None = None
    yaml_body: str | None = None


class SuppressionCreate(BaseModel):
    project_id: str
    rule_id: str | None = None
    path_glob: str | None = None
    fingerprint: str | None = None
    reason: str
    expires_at: str | None = None


class Suppression(SuppressionCreate):
    id: str
    created_by: str | None = None


class BaselineCreate(BaseModel):
    project_id: str
    commit_sha: str
    scan_id: str | None = None


class Baseline(BaseModel):
    id: str
    project_id: str
    commit_sha: str
    fingerprints: list[str] = []
    created_at: str


class Report(BaseModel):
    id: str
    scan_id: str
    format: str = "json"
    uri: str | None = None
    jws_signature: str | None = None
    signed_at: str | None = None
    body: dict | None = None


class ProjectCreate(BaseModel):
    name: str
    repo_url: str | None = None


class Project(BaseModel):
    id: str
    tenant_id: str
    name: str
    repo_url: str | None = None
    created_at: str


class ApiKeyCreate(BaseModel):
    name: str
    scopes: list[str] = []
    expires_days: int = 365


class ApiKeyOut(BaseModel):
    id: str
    name: str
    prefix: str
    scopes: list[str] = []
    expires_at: str | None = None
    created_at: str
    secret: str | None = None


class RuleValidateIn(BaseModel):
    yaml_body: str


class RuleValidateOut(BaseModel):
    valid: bool
    errors: list[dict] = []
