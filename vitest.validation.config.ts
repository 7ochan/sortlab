import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['validation/**/*.test.ts'],
    reporters: ['default'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
