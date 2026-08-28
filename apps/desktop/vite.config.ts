import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_'],
  resolve: {
    alias: {
      '@sirius/types': path.resolve(__dirname, '../../packages/types/src'),
      '@sirius/design-system': path.resolve(__dirname, '../../packages/design-system/src'),
      '@sirius/api': path.resolve(__dirname, '../../packages/api/src'),
      '@sirius/mock-api': path.resolve(__dirname, '../../packages/mock-api/src'),
      '@sirius/state': path.resolve(__dirname, '../../packages/state/src'),
      '@sirius/utils': path.resolve(__dirname, '../../packages/utils/src'),
      '@sirius/ui': path.resolve(__dirname, '../../packages/ui/src'),
    },
  },
});
