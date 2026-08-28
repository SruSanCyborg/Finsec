import { MockApiService } from '@sirius/mock-api';
import { useScanStore } from '@sirius/state';

// Centrally instantiated Mock API service for development and testing
export const mockApiService = new MockApiService();

// Automatically forward mock stream events to Zustand scan store
mockApiService.onStreamEvent((event) => {
  useScanStore.getState().processStreamEvent(event);
});
