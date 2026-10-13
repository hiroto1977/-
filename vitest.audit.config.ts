import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * **定期点検の道具だけを拾う config** (2026-09-24 · パス 441)。
 *
 * `vitest.config.ts` の `include` は `src/**‍/__tests__/**‍/*.test.ts` なので、
 * `__audits__/*.audit.ts` は**既定の収集に入らない** —— `npm test` は今までどおり。
 * ここだけが拾い、`npm run audit:malformed-fields` から走る (CI では走らせない)。
 */
export default defineConfig({
  resolve: {
    alias: { electron: fileURLToPath(new URL('./src/shared/__tests__/electron.stub.ts', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/__audits__/**/*.audit.ts'],
    isolate: true,
    pool: 'forks',
    testTimeout: 3_600_000,
    hookTimeout: 60_000,
  },
});
