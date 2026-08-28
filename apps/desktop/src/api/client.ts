import { HttpClient, SiriusApiClient, SiriusWebSocketClient } from '@sirius/api';
import { useScanStore } from '@sirius/state';
import { runtimeConfig } from '@sirius/utils';
import * as adapters from './adapters';

/**
 * Reads `runtimeConfig` live rather than a value captured at import time.
 *
 * Under Tauri, `bootstrapDaemon()` (see `daemon.ts`) fills `runtimeConfig` in
 * *after* this module has already run and this client already exists — the
 * daemon's real port and token aren't known until the Rust side has actually
 * spawned it. `getAuthToken` is a callback the `HttpClient` invokes per
 * request, so closing over `runtimeConfig.token` rather than a snapshot means
 * every request after that point uses the real token, with nothing here
 * needing to be reconstructed.
 */
export const httpClient = new HttpClient({
  baseUrl: runtimeConfig.apiUrl,
  getAuthToken: () => runtimeConfig.token || null,
});

export const siriusApiClient = new SiriusApiClient(httpClient, adapters);

/**
 * One WebSocket client, reused across scans.
 *
 * The daemon's stream endpoint is per-scan (`/scans/{id}/stream`), not the
 * single fixed URL the mock server used — so `connectToScan` below rebuilds
 * the URL and reconnects for whatever scan id is current, rather than the
 * client being constructed once against one address.
 */
export const siriusWsClient = new SiriusWebSocketClient({
  url: siriusApiClient.streamUrl(runtimeConfig.wsUrl, 'unset', runtimeConfig.token),
  autoReconnect: false, // a finished scan's socket closing is not a connection failure to retry
});

siriusWsClient.subscribe((event) => {
  useScanStore.getState().processStreamEvent(event);
});

siriusWsClient.onStatusChange((status) => {
  useScanStore.getState().setWsConnectionStatus(status);
});

/**
 * Called once `bootstrapDaemon()` has the daemon's real URL — the base URL a
 * plain callback can't refresh, unlike the token above, because `HttpClient`
 * only reads it through `setBaseUrl`.
 */
export function applyDaemonUrl(): void {
  httpClient.setBaseUrl(runtimeConfig.apiUrl);
}

/**
 * Opens the stream for one scan.
 *
 * Called right after `POST /scans` returns an id, and also for a scan the GUI
 * did not start — resuming one begun in a shell, or reopening a project. The
 * daemon replays every frame it has buffered before anything new arrives (see
 * `server/runner.ts`), so connecting late still shows a scan from the
 * beginning rather than picking it up mid-stream.
 */
export function connectToScan(scanId: string): void {
  siriusWsClient.disconnect();
  siriusWsClient.setUrl(siriusApiClient.streamUrl(runtimeConfig.wsUrl, scanId, runtimeConfig.token));
  siriusWsClient.connect();
}
