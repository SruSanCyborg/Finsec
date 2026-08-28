# State Management Architecture

SIRIUS GUI categorizes state into three strict tiers:

```
+-----------------------------------------------------------------------+
|                           State Hierarchy                             |
+-----------------------------------------------------------------------+
| 1. Server State   | TanStack Query (@tanstack/react-query)           |
|    - Remote data (Projects, Findings, Reports, Compliance, Scans)     |
+-------------------+---------------------------------------------------+
| 2. Client State   | Zustand (@sirius/state)                           |
|    - useAppStore      (activeProjectId, activeScanId, offlineMode)   |
|    - useSessionStore  (token, currentUser, isAuthenticated)          |
|    - useScanStore     (liveScan, liveFindings, wsStatus)              |
|    - useUIStore       (commandPalette, notifications, modals)        |
+-------------------+---------------------------------------------------+
| 3. Local UI State | React useState / useReducer                       |
|    - Form inputs, tab selections, dropdown toggle states             |
+-----------------------------------------------------------------------+
```

## Live Scan Pipeline

During live security scans, stream events flow as follows:

```
FinSec Core WS Endpoint
         │
         ▼
SiriusWebSocketClient (packages/api)
         │
         ▼ (ScanStreamEvent)
processStreamEvent (packages/state - useScanStore)
         │  - Normalizes event
         │  - Deduplicates findings
         │  - Updates active scan progress
         ▼
React UI Components (re-render on subscription)
```
