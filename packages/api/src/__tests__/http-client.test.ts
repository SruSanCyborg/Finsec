import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpClient } from '../http-client';
import { ApiError } from '@sirius/utils';

describe('HttpClient', () => {
  let client: HttpClient;

  beforeEach(() => {
    client = new HttpClient({
      baseUrl: 'http://api.sirius.internal/api/v1',
      getAuthToken: () => 'mock-jwt-token-xyz',
    });
    vi.restoreAllMocks();
  });

  it('constructs correct authorization headers and URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'ok' }),
      headers: new Headers(),
    });
    global.fetch = fetchMock;

    const response = await client.get('/health');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.sirius.internal/api/v1/health',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer mock-jwt-token-xyz',
          'Content-Type': 'application/json',
        }),
      })
    );
    expect(response.data).toEqual({ status: 'ok' });
  });

  it('throws ApiError on HTTP 400 response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ message: 'Invalid scan ID parameter' }),
      headers: new Headers(),
    });
    global.fetch = fetchMock;

    await expect(client.get('/scans/invalid')).rejects.toThrow(ApiError);
  });
});
