import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    // Linting a fixture through the real ESLint API is slower than a pure unit
    // test and is worth the wall clock: it is the only way to prove the gate
    // that ships is the gate under test.
    testTimeout: 30_000,
    reporters: ['default'],
  },
});
