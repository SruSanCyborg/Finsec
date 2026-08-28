"""Scan worker: reads repository files, runs the 13 rules, prices findings.

A faithful port of the CLI's local engine (packages/cli/src/engine on the CLI
branch) so hosted scans and local scans agree on the same repository. Kept
dependency-free: regex + AST-light line analysis. Full tree-sitter parity can be
added later; the wire contract is identical either way.
"""

from __future__ import annotations

import json
import os
import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from .engine import (
    AUTH_DECORATORS,
    HIGH_ENTROPY_RE,
    JWT_UNVERIFIED,
    LOG_CALL,
    MONEY_ROUTE,
    PII_ACCESS,
    PII_FIELD,
    REDACTED,
    SECRET_PATTERNS,
    WEB_DECORATORS,
    compliance_score,
    estimate_exposure,
    fingerprint,
    shannon_entropy,
)

DEFAULT_IGNORES = {".git", "node_modules", ".next", "dist", "build", "venv", ".venv", "__pycache__", ".sirius"}

SUPPORTED_EXTENSIONS = {".py", ".js", ".ts", ".jsx", ".tsx", ".go"}

SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"]


@dataclass
class RawFinding:
    rule_id: str
    severity: str
    category: str
    message: str
    line: int
    col: int
    snippet: str
    compliance_ref: list[str]
    money_at_risk_inr: int
    end_line: int | None = None
    fix_action: str | None = None
    validity: str = "unknown"
    taint: str | None = None
    fingerprint: str = ""
    tags: list[str] = field(default_factory=list)


@dataclass
class ScanResult:
    scan_id: str
    findings: list[RawFinding]
    file_count: int
    counts: dict[str, int]
    compliance_score: float
    money_at_risk_inr: int
    exit_code: int
    errors: list[dict] = field(default_factory=list)


def _snippet(text: str, limit: int = 120) -> str:
    t = text.strip()
    return t[:limit] if len(t) <= limit else t[: limit - 3] + "…"


def _is_call(node_type: str) -> bool:
    return node_type in ("call", "call_expression")


def _callee(line_text: str, name: str) -> bool:
    return name in line_text


# ---------------------------------------------------------------------------
# Rule implementations (ports of packages/cli/src/engine/rules.ts)
# ---------------------------------------------------------------------------

def _collect(path: Path) -> list[tuple[Path, list[str]]]:
    """Walk a directory, respecting ignores, returning (path, lines)."""
    out: list[tuple[Path, list[str]]] = []
    for root, dirs, files in os.walk(path):
        dirs[:] = [d for d in dirs if d not in DEFAULT_IGNORES and not d.startswith(".")]
        for name in sorted(files):
            ext = Path(name).suffix.lower()
            if ext in SUPPORTED_EXTENSIONS:
                p = Path(root) / name
                try:
                    with open(p, "r", encoding="utf-8", errors="replace") as f:
                        lines = f.read().splitlines()
                    out.append((p, lines))
                except OSError:
                    continue
            elif name in ("package.json", "requirements.txt"):
                p = Path(root) / name
                try:
                    with open(p, "r", encoding="utf-8", errors="replace") as f:
                        out.append((p, f.read().splitlines()))
                except OSError:
                    continue
    return out


def _run_secrets(path: Path, lines: list[str], rel: str) -> list[RawFinding]:
    findings: list[RawFinding] = []
    for idx, raw in enumerate(lines):
        text = raw.strip()
        if not text or text.startswith("#") or text.startswith("//"):
            continue
        # skip obvious test fixtures
        if re.search(r"\btest|fixture|mock\b", rel, re.I) and "sk_live_" not in text and "AKIA" not in text:
            continue

        for name, pattern, provider, category in SECRET_PATTERNS:
            m = pattern.search(text)
            if not m:
                continue
            key = m.group(0)
            # SIR-SEC-001 — hardcoded payment-provider secret key
            if pattern is SECRET_PATTERNS[0][1] or pattern is SECRET_PATTERNS[1][1] or pattern is SECRET_PATTERNS[2][1]:
                findings.append(
                    RawFinding(
                        rule_id="SIR-SEC-001",
                        severity="critical",
                        category="secrets",
                        message=f"Hardcoded {name}",
                        line=idx + 1,
                        col=text.find(key) + 1,
                        snippet=_snippet(raw),
                        compliance_ref=["PCI-DSS:8.6.2", "RBI-DPSC", "DPDP:8", "CWE:798"],
                        money_at_risk_inr=estimate_exposure("SIR-SEC-001", "critical", provider=provider),
                        fix_action="env_lookup",
                    )
                )
            break

        # SIR-SEC-002 — high-entropy string
        for m in HIGH_ENTROPY_RE.finditer(text):
            token = m.group(0)
            if shannon_entropy(token) >= 3.5:
                findings.append(
                    RawFinding(
                        rule_id="SIR-SEC-002",
                        severity="high",
                        category="secrets",
                        message="High-entropy string in source or config",
                        line=idx + 1,
                        col=m.start() + 1,
                        snippet=_snippet(raw),
                        compliance_ref=["PCI-DSS:8.6.2", "DPDP:8"],
                        money_at_risk_inr=estimate_exposure("SIR-SEC-002", "high"),
                        fix_action="env_lookup",
                    )
                )
    return findings


def _run_injection(path: Path, lines: list[str]) -> list[RawFinding]:
    findings: list[RawFinding] = []
    for idx, raw in enumerate(lines):
        text = raw.strip()
        # SIR-SEC-010 — SQL built with string formatting
        if re.search(r"\.execute\s*\(|\.query\s*\(|\.raw\s*\(", text):
            if re.search(r"%\s*[A-Za-z_][A-Za-z0-9_]*|f[\"']|\.format\s*\(|\+\s*[A-Za-z_]", text):
                findings.append(
                    RawFinding(
                        rule_id="SIR-SEC-010",
                        severity="critical",
                        category="injection",
                        message="SQL built from string formatting",
                        line=idx + 1,
                        col=text.find("execute") + 1,
                        snippet=_snippet(raw),
                        compliance_ref=["PCI-DSS:6.2.4", "RBI-DPSC", "CWE:89"],
                        money_at_risk_inr=estimate_exposure("SIR-SEC-010", "critical"),
                        fix_action="parameterize_query",
                        tags=["injection", "database"],
                    )
                )
        # SIR-SEC-011 — OS command built from user input
        if re.search(r"os\.system\s*\(|subprocess\.(run|call|Popen|check_output)\s*\(|child_process\.exec", text):
            if "shell=True" in text or "shell: true" in text or "os.system" in text or ".exec(" in text:
                findings.append(
                    RawFinding(
                        rule_id="SIR-SEC-011",
                        severity="critical",
                        category="injection",
                        message="OS command built from user input",
                        line=idx + 1,
                        col=text.find("(") + 1,
                        snippet=_snippet(raw),
                        compliance_ref=["PCI-DSS:6.2.4", "CWE:78"],
                        money_at_risk_inr=estimate_exposure("SIR-SEC-011", "critical"),
                        fix_action="sanitize_input",
                        tags=["injection", "shell"],
                    )
                )
    return findings


def _run_auth(path: Path, lines: list[str]) -> list[RawFinding]:
    findings: list[RawFinding] = []
    for idx, raw in enumerate(lines):
        text = raw.strip()
        # SIR-SEC-020 — route missing an authentication decorator
        if text.startswith("@") and WEB_DECORATORS.search(text) and not AUTH_DECORATORS.search(text):
            findings.append(
                RawFinding(
                    rule_id="SIR-SEC-020",
                    severity="high",
                    category="auth",
                    message="Route missing an authentication decorator",
                    line=idx + 1,
                    col=1,
                    snippet=_snippet(raw),
                    compliance_ref=["PCI-DSS:8.4.2", "RBI-DPSC"],
                    money_at_risk_inr=estimate_exposure("SIR-SEC-020", "high"),
                    fix_action="add_auth_decorator",
                    tags=["auth", "endpoint"],
                )
            )
        # SIR-SEC-021 — JWT decoded without signature verification
        if re.search(r"jwt\.decode|jsonwebtoken\.decode", text) and JWT_UNVERIFIED.search(text):
            findings.append(
                RawFinding(
                    rule_id="SIR-SEC-021",
                    severity="critical",
                    category="auth",
                    message="JWT decoded without signature verification",
                    line=idx + 1,
                    col=text.find("decode") + 1,
                    snippet=_snippet(raw),
                    compliance_ref=["PCI-DSS:8.4.2", "PCI-DSS:8.3.1", "RBI-DPSC"],
                    money_at_risk_inr=350_000,
                    fix_action="enforce_jwt_verify",
                    tags=["auth", "bypass"],
                )
            )
    return findings


def _run_pii(path: Path, lines: list[str]) -> list[RawFinding]:
    findings: list[RawFinding] = []
    for idx, raw in enumerate(lines):
        text = raw.strip()
        # SIR-SEC-030 — PII written to logs
        if LOG_CALL.search(text):
            leaking = False
            for m in re.finditer(r"[^,()]*", text):
                arg = m.group(0).strip()
                if (PII_FIELD.search(arg) or PII_ACCESS.search(arg)) and not REDACTED.search(arg):
                    leaking = True
            if leaking:
                findings.append(
                    RawFinding(
                        rule_id="SIR-SEC-030",
                        severity="high",
                        category="logging",
                        message="PAN, Aadhaar, or other PII written to logs",
                        line=idx + 1,
                        col=text.find("(") + 1,
                        snippet=_snippet(raw),
                        compliance_ref=["PCI-DSS:3.4.1", "DPDP:8", "GDPR:Art.5"],
                        money_at_risk_inr=estimate_exposure("SIR-SEC-030", "high"),
                        fix_action="redact_pii_log",
                        tags=["pii", "exposure"],
                    )
                )
        # SIR-SEC-031 — full PAN stored unmasked
        if re.search(r"Column\s*\(|models\.(Char|Text)Field", text):
            lhs = text.split("=")[0] or ""
            if PII_FIELD.search(lhs) and not re.search(r"token|vault|mask|hash|encrypt", text, re.I):
                findings.append(
                    RawFinding(
                        rule_id="SIR-SEC-031",
                        severity="critical",
                        category="pii",
                        message="Full PAN stored unmasked",
                        line=idx + 1,
                        col=1,
                        snippet=_snippet(raw),
                        compliance_ref=["PCI-DSS:3.5.1", "PCI-DSS:3.4.1", "RBI-DPSC"],
                        money_at_risk_inr=400_000,
                        fix_action="tokenize_pan",
                        tags=["pii", "storage"],
                    )
                )
    return findings


def _run_crypto(path: Path, lines: list[str]) -> list[RawFinding]:
    findings: list[RawFinding] = []
    for idx, raw in enumerate(lines):
        text = raw.strip()
        # SIR-SEC-040 — weak hash / ECB / static IV
        if re.search(r"hashlib\.(md5|sha1)\s*\(|createHash\s*\(", text) and re.search(r"md5|sha1", text, re.I):
            algorithm = "MD5" if re.search(r"md5", text, re.I) else "SHA1"
            findings.append(
                RawFinding(
                    rule_id="SIR-SEC-040",
                    severity="medium",
                    category="crypto",
                    message=f"Weak hash algorithm ({algorithm})",
                    line=idx + 1,
                    col=text.find("(") + 1,
                    snippet=_snippet(raw),
                    compliance_ref=["PCI-DSS:6.2.4", "PCI-DSS:3.6.1", "RBI-DPSC"],
                    money_at_risk_inr=estimate_exposure("SIR-SEC-040", "medium"),
                    fix_action="upgrade_crypto",
                    tags=["crypto"],
                )
            )
        if re.search(r"MODE_ECB", text):
            findings.append(
                RawFinding(
                    rule_id="SIR-SEC-040",
                    severity="medium",
                    category="crypto",
                    message="ECB mode leaks plaintext structure",
                    line=idx + 1,
                    col=1,
                    snippet=_snippet(raw),
                    compliance_ref=["PCI-DSS:6.2.4", "PCI-DSS:3.6.1", "RBI-DPSC"],
                    money_at_risk_inr=estimate_exposure("SIR-SEC-040", "medium"),
                    fix_action="upgrade_crypto",
                    tags=["crypto"],
                )
            )
        if re.search(r"\biv\b|initialization_vector", text, re.I) and re.search(r"['\"][^'\"]{8,}['\"]", text):
            findings.append(
                RawFinding(
                    rule_id="SIR-SEC-040",
                    severity="medium",
                    category="crypto",
                    message="Static initialization vector",
                    line=idx + 1,
                    col=1,
                    snippet=_snippet(raw),
                    compliance_ref=["PCI-DSS:6.2.4", "PCI-DSS:3.6.1", "RBI-DPSC"],
                    money_at_risk_inr=estimate_exposure("SIR-SEC-040", "medium"),
                    fix_action="upgrade_crypto",
                    tags=["crypto"],
                )
            )
        # SIR-SEC-041 — cardholder data over plain HTTP
        if re.search(r"https?://", text) and re.search(r"http://", text):
            if not re.search(r"http://(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])", text):
                if not re.search(r"w3\.org|xmlns|schemas?\.|\.dtd|\.xsd", text):
                    findings.append(
                        RawFinding(
                            rule_id="SIR-SEC-041",
                            severity="high",
                            category="crypto",
                            message="Cardholder data sent over plain HTTP",
                            line=idx + 1,
                            col=text.find("http://") + 1,
                            snippet=_snippet(raw),
                            compliance_ref=["PCI-DSS:4.2.1", "RBI-DPSC"],
                            money_at_risk_inr=90_000,
                            fix_action="enforce_tls",
                            tags=["crypto", "transport"],
                        )
                    )
    return findings


def _run_ratelimit(path: Path, lines: list[str]) -> list[RawFinding]:
    findings: list[RawFinding] = []
    for idx, raw in enumerate(lines):
        text = raw.strip()
        # SIR-SEC-050 — money endpoint without rate limit
        if text.startswith("@") and WEB_DECORATORS.search(text) and MONEY_ROUTE.search(text):
            if not re.search(r"limit|throttle|ratelimit", text, re.I):
                findings.append(
                    RawFinding(
                        rule_id="SIR-SEC-050",
                        severity="medium",
                        category="ratelimit",
                        message="Money-movement endpoint without a rate limit",
                        line=idx + 1,
                        col=1,
                        snippet=_snippet(raw),
                        compliance_ref=["PCI-DSS:6.2.4", "RBI-DPSC"],
                        money_at_risk_inr=estimate_exposure("SIR-SEC-050", "medium"),
                        fix_action="add_rate_limit",
                        tags=["ratelimit", "money"],
                    )
                )
        # SIR-SEC-051 — money POST without idempotency key
        if (re.search(r"@.*(post|put)", text, re.I) and MONEY_ROUTE.search(text)
                and not re.search(r"idempotenc", text, re.I)):
            findings.append(
                RawFinding(
                    rule_id="SIR-SEC-051",
                    severity="medium",
                    category="ratelimit",
                    message="Money-movement POST without an idempotency key",
                    line=idx + 1,
                    col=1,
                    snippet=_snippet(raw),
                    compliance_ref=[],
                    money_at_risk_inr=estimate_exposure("SIR-SEC-051", "medium"),
                    fix_action="add_idempotency_key",
                    tags=["money"],
                )
            )
    return findings


NON_REGISTRY = re.compile(r"^(git\+|git:|https?:|ssh:|file:|link:|\.{0,2}/)|\.(tar\.gz|tgz|zip|whl)(#|$)")
FLOATING_NPM = re.compile(r"^(\*|latest|x|\^|~|>=?|<)")
DEPENDENCY_FIELDS = ("dependencies", "devDependencies", "optionalDependencies", "peerDependencies")
INSTALL_HOOKS = ("preinstall", "install", "postinstall")


def _run_supplychain(path: Path, lines: list[str]) -> list[RawFinding]:
    findings: list[RawFinding] = []
    if path.name == "package.json":
        try:
            pkg = json.loads("\n".join(lines))
        except json.JSONDecodeError:
            return findings
        scripts = pkg.get("scripts") or {}
        for hook in INSTALL_HOOKS:
            body = scripts.get(hook)
            if isinstance(body, str):
                findings.append(
                    RawFinding(
                        rule_id="SIR-SEC-060",
                        severity="high",
                        category="supplychain",
                        message=f'"{hook}" runs on every dependency install',
                        line=1,
                        col=1,
                        snippet=_snippet(body),
                        compliance_ref=["PCI-DSS:6.3.2"],
                        money_at_risk_inr=estimate_exposure("SIR-SEC-060", "high"),
                        fix_action="pin_or_remove_dep",
                        tags=["supplychain"],
                    )
                )
        for field in DEPENDENCY_FIELDS:
            deps = pkg.get(field) or {}
            if not isinstance(deps, dict):
                continue
            for name, spec in deps.items():
                if not isinstance(spec, str):
                    continue
                if NON_REGISTRY.search(spec):
                    findings.append(
                        RawFinding(
                            rule_id="SIR-SEC-060",
                            severity="high",
                            category="supplychain",
                            message=f'Dependency "{name}" resolved outside the registry',
                            line=1,
                            col=1,
                            snippet=_snippet(f'"{name}": "{spec}"'),
                            compliance_ref=["PCI-DSS:6.3.2"],
                            money_at_risk_inr=estimate_exposure("SIR-SEC-060", "high"),
                            fix_action="pin_or_remove_dep",
                            tags=["supplychain"],
                        )
                    )
        return findings

    if path.name == "requirements.txt":
        for idx, raw in enumerate(lines):
            text = raw.strip()
            if not text or text.startswith("#"):
                continue
            if NON_REGISTRY.search(text) or text.startswith("-e ") or text.startswith("--editable"):
                named = re.search(r"#egg=([A-Za-z0-9._-]+)", text)
                name = named.group(1) if named else (text.split("/")[-1] or text)
                findings.append(
                    RawFinding(
                        rule_id="SIR-SEC-060",
                        severity="high",
                        category="supplychain",
                        message=f'Dependency "{name}" resolved outside the registry',
                        line=idx + 1,
                        col=1,
                        snippet=_snippet(raw),
                        compliance_ref=["PCI-DSS:6.3.2"],
                        money_at_risk_inr=estimate_exposure("SIR-SEC-060", "high"),
                        fix_action="pin_or_remove_dep",
                        tags=["supplychain"],
                    )
                )
    return findings


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

def _run_all(path: Path, lines: list[str], rel: str) -> list[RawFinding]:
    out: list[RawFinding] = []
    out.extend(_run_secrets(path, lines, rel))
    out.extend(_run_injection(path, lines))
    out.extend(_run_auth(path, lines))
    out.extend(_run_pii(path, lines))
    out.extend(_run_crypto(path, lines))
    out.extend(_run_ratelimit(path, lines))
    out.extend(_run_supplychain(path, lines))
    return out


def dedupe(findings: list[RawFinding]) -> list[RawFinding]:
    """Two findings with the same fingerprint are one finding (CLI parity)."""
    seen: set[str] = set()
    out: list[RawFinding] = []
    for f in sorted(findings, key=lambda x: SEVERITY_ORDER.index(x.severity) if x.severity in SEVERITY_ORDER else 99):
        if f.fingerprint in seen:
            continue
        seen.add(f.fingerprint)
        out.append(f)
    return out


def scan_directory(root: str | Path, scan_id: str, rulesets: list[str] | None = None) -> ScanResult:
    """Scan a directory, returning findings + totals. Used by the API worker."""
    root_path = Path(root)
    files = _collect(root_path)
    raw: list[RawFinding] = []
    errors: list[dict] = []

    for path, lines in files:
        rel = path.relative_to(root_path).as_posix()
        try:
            raw.extend(_run_all(path, lines, rel))
        except Exception as exc:  # one bad file must not abandon the scan
            errors.append({"path": rel, "detail": str(exc)})

    # assign fingerprints + money (post-dedup)
    for f in raw:
        f.fingerprint = fingerprint(f.rule_id, f.file if hasattr(f, "file") else "", f.snippet)

    unique = dedupe(raw)
    counts = {sev: 0 for sev in SEVERITY_ORDER}
    for f in unique:
        counts[f.severity] += 1
    total_money = sum(f.money_at_risk_inr for f in unique)
    score = compliance_score(counts, max(1, len(files)))
    exit_code = 1 if counts["critical"] or counts["high"] else 0

    return ScanResult(
        scan_id=scan_id,
        findings=unique,
        file_count=len(files),
        counts=counts,
        compliance_score=score,
        money_at_risk_inr=total_money,
        exit_code=exit_code,
        errors=errors,
    )


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
