import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    fileParallelism: false,
    testTimeout: 30_000,
    env: {
      DATABASE_URL:
        'postgres://postgres:postgres@localhost:5432/trial_booking_test',
    },
    globalSetup: './src/__tests__/helpers/global-setup.ts',
  },
});
