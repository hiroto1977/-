import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    // Isolate each test file in its own forked worker. Renderer modules
    // that touch IndexedDB (vault / library / fsa / proxy) install
    // singletons + global state via fake-indexeddb. Sharing module
    // graphs across files causes flaky cross-file interactions; forks +
    // isolate avoids it.
    isolate: true,
    pool: 'forks',
  },
});
