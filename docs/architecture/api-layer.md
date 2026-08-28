# API Layer Architecture

SIRIUS GUI isolates all backend HTTP and WebSocket communication inside `@sirius/api`.

## Architecture Flow

```
React Component
      │
      ▼
Feature Custom Hooks (e.g. useScans)
      │
      ▼
SiriusApiClient / SiriusWebSocketClient
      │
      ▼
HttpClient (Timeout, Auth Injection, Error Handling, AbortController)
      │
      ▼
FinSec Core API (or MockApiService in dev)
```

## Mock API vs Real Core API Swapping

The API client reads `VITE_USE_MOCK_API` from the environment.

When `VITE_USE_MOCK_API=true`, requests are served locally by `MockApiService` without network roundtrips. When connecting to production or staging, setting `VITE_USE_MOCK_API=false` points `HttpClient` to `VITE_API_URL` with zero changes required to React components.
