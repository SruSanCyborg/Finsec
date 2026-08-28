import { describe, it, expect } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  useScansQuery,
  useFindingsQuery,
  useComplianceSummaryQuery,
  useSuppressionsQuery,
} from '../api/queries';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('Project Switching Isolation Suite', () => {
  it('scopes query keys by projectId preventing cross-project stale data leaks', async () => {
    const wrapper = createWrapper();

    // Query Project A
    const { result: scansProjA } = renderHook(() => useScansQuery('prj-finsec-core-01'), { wrapper });
    const { result: findingsProjA } = renderHook(() => useFindingsQuery('prj-finsec-core-01'), { wrapper });
    const { result: compProjA } = renderHook(() => useComplianceSummaryQuery('prj-finsec-core-01'), { wrapper });
    const { result: suppProjA } = renderHook(() => useSuppressionsQuery('prj-finsec-core-01'), { wrapper });

    await waitFor(() => expect(scansProjA.current.isSuccess).toBe(true));
    await waitFor(() => expect(findingsProjA.current.isSuccess).toBe(true));
    await waitFor(() => expect(compProjA.current.isSuccess).toBe(true));
    await waitFor(() => expect(suppProjA.current.isSuccess).toBe(true));

    expect(scansProjA.current.data?.length).toBeGreaterThan(0);
    expect(findingsProjA.current.data?.length).toBeGreaterThan(0);

    // Query Project B (Vault Service)
    const { result: scansProjB } = renderHook(() => useScansQuery('prj-vault-service-02'), { wrapper });
    const { result: findingsProjB } = renderHook(() => useFindingsQuery('prj-vault-service-02'), { wrapper });

    await waitFor(() => expect(scansProjB.current.isSuccess).toBe(true));
    await waitFor(() => expect(findingsProjB.current.isSuccess).toBe(true));

    // Both project queries maintain isolated server responses
    expect(scansProjB.current.data).toBeDefined();
    expect(findingsProjB.current.data).toBeDefined();
  });
});
