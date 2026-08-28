"""Deterministic detection primitives shared by rules (ported from the CLI's
engine so hosted scans agree with local ones)."""

from __future__ import annotations

import hashlib
import math
import re

# ---------------------------------------------------------------------------
# Money-at-risk model (ported from packages/cli/src/engine/exposure-model.ts)
# ---------------------------------------------------------------------------

REACHABILITY = {"direct": 1.0, "authenticated": 0.4, "local": 0.15}

# base amount per rule, annual-equivalent estimate for one instance
MODEL: dict[str, tuple[int, str]] = {
    "SIR-SEC-001": (4_200_000, "live payment credential, velocity-bounded"),
    "SIR-SEC-002": (80_000, "unknown-scope high-entropy credential"),
    "SIR-SEC-010": (2_400_000, "injection reaching a ledger"),
    "SIR-SEC-011": (3_000_000, "command execution = host compromise"),
    "SIR-SEC-020": (600_000, "unauthenticated route fronts other data"),
    "SIR-SEC-021": (350_000, "account takeover via unverified JWT"),
    "SIR-SEC-030": (1_300_000, "PAN in logs spreads cardholder data"),
    "SIR-SEC-031": (400_000, "unmasked PAN storage / tokenisation violation"),
    "SIR-SEC-040": (150_000, "weak hash weakens a control"),
    "SIR-SEC-041": (900_000, "cardholder data in clear on the path"),
    "SIR-SEC-050": (250_000, "unthrottled money endpoint"),
    "SIR-SEC-051": (180_000, "retried POST moves money twice"),
    "SIR-SEC-060": (500_000, "dependency install script in CI"),
}

BY_SEVERITY = {"critical": 1_000_000, "high": 400_000, "medium": 120_000, "low": 30_000, "info": 0}

PROVIDER_WEIGHT = {
    "private key block": 1.4,
    "AWS access key": 1.2,
    "Stripe secret key": 1.0,
    "Razorpay live key": 1.0,
    "Razorpay test key": 0.01,
    "Google API key": 0.4,
    "Slack token": 0.3,
    "Stripe test key": 0.01,
}


def estimate_exposure(
    rule_id: str,
    severity: str,
    provider: str | None = None,
    reachability: str = "direct",
    verified_live: bool = False,
    confirmed_inactive: bool = False,
    age_days: int | None = None,
) -> int:
    """Returns money at risk in INR, rounded to the nearest 10k (CLI parity)."""
    entry = MODEL.get(rule_id)
    base = entry[0] if entry else BY_SEVERITY.get(severity, 0)
    multiplier = REACHABILITY.get(reachability, 1.0)
    if provider:
        multiplier *= PROVIDER_WEIGHT.get(provider, 1.0)
    if verified_live:
        multiplier *= 2.0
    if confirmed_inactive and not verified_live:
        multiplier *= 0.15
    if age_days and age_days > 30:
        multiplier *= min(1.5, 1 + age_days / 730)
    return round((base * multiplier) / 10_000) * 10_000


# ---------------------------------------------------------------------------
# Fingerprint (ported from engine/scanner.ts) — stable across surfaces
# ---------------------------------------------------------------------------

def fingerprint(rule_id: str, path: str, snippet: str) -> str:
    normalised = re.sub(r"\s+", " ", snippet or "").strip()
    raw = f"{rule_id}\x00{path}\x00{normalised}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]


# ---------------------------------------------------------------------------
# Compliance score (ported from engine/scanner.ts)
# ---------------------------------------------------------------------------

SEVERITY_PENALTY = {"critical": 12, "high": 6, "medium": 2, "low": 0.5, "info": 0}


def compliance_score(counts: dict[str, int], file_count: int) -> float:
    penalty = sum(SEVERITY_PENALTY.get(sev, 0) * counts.get(sev, 0) for sev in SEVERITY_PENALTY)
    scale = max(1.0, math.log10(max(10, file_count)))
    return max(0.0, round((100 - penalty / scale) * 10) / 10)


# ---------------------------------------------------------------------------
# Secret detection helpers
# ---------------------------------------------------------------------------

SECRET_PATTERNS: list[tuple[str, re.Pattern, str, str]] = [
    ("Stripe secret key", re.compile(r"sk_live_[0-9a-zA-Z]{24,}"), "Stripe secret key", "secrets"),
    ("Razorpay live key", re.compile(r"rzp_live_[0-9a-zA-Z]{24,}"), "Razorpay live key", "secrets"),
    ("AWS access key", re.compile(r"AKIA[0-9A-Z]{16}"), "AWS access key", "secrets"),
    ("private key block", re.compile(r"-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----"), "private key block", "secrets"),
]

HIGH_ENTROPY_RE = re.compile(r"[A-Za-z0-9+/=_-]{28,}")


def shannon_entropy(text: str) -> float:
    if not text:
        return 0.0
    counts: dict[str, int] = {}
    for ch in text:
        counts[ch] = counts.get(ch, 0) + 1
    length = len(text)
    return -sum((c / length) * math.log2(c / length) for c in counts.values())


# ---------------------------------------------------------------------------
# PII / crypto / auth helpers
# ---------------------------------------------------------------------------

PII_FIELD = re.compile(r"\b(pan|aadhaar|cvv|cvc|ssn|passport|card[_.]?(number|no)|account[_.]?number)\b", re.I)
PII_ACCESS = re.compile(r"\bcard\b[^)]{0,24}?['\"]?(number|no|cvv|cvc)['\"]?", re.I)
REDACTED = re.compile(r"^\s*(redact|mask|tokeni[sz]e|hash|anonymi[sz]e|scrub|saniti[sz]e|last4|truncate)\s*\(", re.I)
LOG_CALL = re.compile(r"(^|\.)(log|logger|logging|console)\.(debug|info|warn|warning|error|log)$")

MONEY_ROUTE = re.compile(r"(transfer|payout|refund|charge|payment|withdraw|settle|disburse)", re.I)
WEB_DECORATORS = re.compile(r"(route|get|post|put|delete|patch|api|app)", re.I)
AUTH_DECORATORS = re.compile(
    r"(login_required|requires_auth|authenticated|jwt_required|permission|authorize|protected)", re.I
)
JWT_UNVERIFIED = re.compile(
    r"['\"]?verify(_signature)?['\"]?\s*[:=]\s*(False|false)|"
    r"alg(orithms)?\s*[:=]\s*\[?\s*['\"]none['\"]",
    re.I,
)
