import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['packages/**/*.test.ts', 'packages/**/*.test.tsx', 'apps/**/*.test.ts', 'apps/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
  resolve: {
    alias: {
      '@sirius/types': path.resolve(__dirname, './packages/types/src'),
      '@sirius/design-system': path.resolve(__dirname, './packages/design-system/src'),
      '@sirius/api': path.resolve(__dirname, './packages/api/src'),
      '@sirius/mock-api': path.resolve(__dirname, './packages/mock-api/src'),
      '@sirius/state': path.resolve(__dirname, './packages/state/src'),
      '@sirius/utils': path.resolve(__dirname, './packages/utils/src'),
      '@sirius/ui': path.resolve(__dirname, './packages/ui/src'),
    },
  },
});
