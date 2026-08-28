import { HttpClient, SiriusApiClient, SiriusWebSocketClient } from '@sirius/api';
import { MockApiService } from '@sirius/mock-api';
import { useScanStore } from '@sirius/state';
import { getSiriusEnv } from '@sirius/utils';

const env = getSiriusEnv();

export const httpClient = new HttpClient({
  baseUrl: env.VITE_API_URL,
  getAuthToken: () => localStorage.getItem('sirius_auth_token') || 'demo-key',
});

export const siriusApiClient = new SiriusApiClient(httpClient);

export const siriusWsClient = new SiriusWebSocketClient({
  url: env.VITE_WS_URL,
  autoReconnect: true,
});

siriusWsClient.subscribe((event) => {
  useScanStore.getState().processStreamEvent(event);
});

// Centrally instantiated Mock API service for local development / testing fallback
export const mockApiService = new MockApiService();

mockApiService.onStreamEvent((event) => {
  useScanStore.getState().processStreamEvent(event);
});

