import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  useCreateSuppressionMutation,
  useApplyFixMutation,
  useCreateScanMutation,
} from '../api/queries';

function createWrapperWithClient(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  };
}

describe('Cache Invalidation Matrix Suite', () => {
  it('invalidates relevant query keys upon suppression mutation success', async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = createWrapperWithClient(queryClient);

    const { result } = renderHook(() => useCreateSuppressionMutation(), { wrapper });

    await result.current.mutateAsync({
      projectId: 'prj-finsec-core-01',
      rule_id: 'SIR-SEC-004',
      reason: 'accepted_risk',
    });


    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['suppressions'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['findings'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['compliance-summary'] });
  });

  it('invalidates relevant query keys upon fix proposal application', async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = createWrapperWithClient(queryClient);

    const { result } = renderHook(() => useApplyFixMutation(), { wrapper });

    await result.current.mutateAsync({
      scanId: 'scan-01',
      findingId: 'fnd-88219',
      projectId: 'prj-finsec-core-01',
      finding: { id: 'fnd-88219', scanId: 'scan-01', projectId: 'prj-finsec-core-01' } as never,
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['findings'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['fix-proposal'] });
  });

  it('invalidates scan and project query keys upon new scan creation', async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = createWrapperWithClient(queryClient);

    const { result } = renderHook(() => useCreateScanMutation(), { wrapper });

    await result.current.mutateAsync({ projectId: 'prj-finsec-core-01' });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['scans'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['projects'] });
  });
});
