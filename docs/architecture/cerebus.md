# Cerebus AI Security Analyst Architecture (`/cerebus`)

Cerebus is SIRIUS's AI security analyst. It operates as an expert advisor within the security investigation workspace, explaining vulnerabilities, technical impacts, compliance implications, financial exposure, and generating read-only remediation proposals.

## Workspace & Data Architecture

```
[Finding Detail / Dashboard / Command Palette / Scan Complete]
       │
       ▼
[Cerebus Workspace /cerebus?finding=<id>]
       │
       ├─▶ CerebusContextPanel (Rule ID, Severity, Location, Exposure, Compliance)
       ├─▶ Conversation Stream (User Prompts + Cerebus Analyst Reports)
       │       ├─▶ Structured Sections (ANALYSIS, IMPACT, RECOMMENDED ACTION)
       │       ├─▶ Remediation Proposal & Read-Only DiffPreviewCard
       │       └─▶ VerificationStatusCard (PASSED / VERIFICATION REQUIRED)
       │
       └─▶ CerebusComposer (Multiline Input + Quick Prompts)
```

## Primary Principles & Safety Boundaries

1. **Advisory Role**: Cerebus explains and proposes. The FinSec Core API remains authoritative for security findings, severities, compliance scores, and financial exposure.
2. **No Chain-of-Thought**: Internal reasoning tokens are NEVER displayed to the user; only structured user-facing analyst sections (`ANALYSIS`, `IMPACT`, `RECOMMENDED ACTION`, `PROPOSED REMEDIATION`, `DIFF`).
3. **Read-Only Diffs**: Code diff previews (`DiffPreviewCard`) are strictly read-only evidence previews. Zero file mutations, git patch applications, or shell executions in Phase 6.
4. **Secret Protection**: All code diffs and analyst explanations pass through `redactSensitiveText()` before rendering (`sk_live_••••••••`).
