import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
export default defineConfig({
  resolve: {
    alias: { '$app/env/private': fileURLToPath(new URL('./tests/environment.ts', import.meta.url)) }
  },
  test: { include: ['src/**/*.test.ts'] }
});
