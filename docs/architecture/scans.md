# Scan Experience & Replay Architecture (`/scans`)

The Complete Scan Experience covers pre-scan launcher configuration (`/scans/new`), live scan command deck streaming (`/scans/:scanId`), and historical scan execution logs (`/scans`).

## Architecture & Data Flow

```
[Pre-Scan Launcher /scans/new]
       │
       ▼
[useCreateScanMutation] ──▶ [FinSec Core API / MockApiService]
       │
       ▼
[Live Command Deck /scans/:scanId]
       │
       ├─▶ WebSocket Client / MockScanSimulator
       │       │
       │       ▼ (Typed ScanStreamEvent)
       ├─▶ ScanStore (Zustand)
       │       │
       │       ├─▶ Progress Hero (0-100%)
       │       ├─▶ PipelineVisualizer (Prepare -> Finalize)
       │       ├─▶ LiveConsole (Monospace logs with auto-scroll)
       │       └─▶ LiveFindingStream (800ms arrival animation)
       │
       ▼
[Scan Completion Sweep & Gate Outcome (PASSED / BLOCKED)]
```

## Gate Semantics

- **Severity Threshold**: `critical` | `high` | `medium` | `low` | `info` (determines which severity level counts toward the build gate).
- **Fail-On Predicate**: `all` | `new` | `verified-secrets` (determines finding predicate for build pass/fail outcome).
- The two concepts are distinct and must never be conflated.

## Stream Normalization & State Rules

- WebSocket stream events (`scan_started`, `scan_progress`, `console_event`, `finding_discovered`, `scan_completed`) are parsed and normalized in `useScanStore`.
- React components NEVER calculate scan progress, AST parsing, or finding severity locally.
