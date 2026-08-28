/// <reference types="vite/client" />
import { z } from 'zod';

const envSchema = z.object({
  VITE_API_URL: z.string().url().default('http://localhost:4010'),
  VITE_WS_URL: z.string().url().default('ws://localhost:4011/api/v1/scans/stream'),
  VITE_APP_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  VITE_USE_MOCK_API: z
    .string()
    .transform((val) => val === 'true' || val === '1')
    .default('false'),
});

export type SiriusEnv = z.infer<typeof envSchema>;

export function getSiriusEnv(): SiriusEnv {
  // Safe environment parsing with defaults
  const rawEnv = {
    VITE_API_URL: import.meta.env?.VITE_API_URL,
    VITE_WS_URL: import.meta.env?.VITE_WS_URL,
    VITE_APP_ENV: import.meta.env?.VITE_APP_ENV,
    VITE_USE_MOCK_API: import.meta.env?.VITE_USE_MOCK_API,
  };

  const parsed = envSchema.safeParse(rawEnv);
  if (!parsed.success) {
    console.warn('⚠️ SIRIUS Environment validation warning:', parsed.error.format());
    return {
      VITE_API_URL: 'http://localhost:4010',
      VITE_WS_URL: 'ws://localhost:4011/api/v1/scans/stream',
      VITE_APP_ENV: 'development',
      VITE_USE_MOCK_API: false,
    };
  }

  return parsed.data;
}

