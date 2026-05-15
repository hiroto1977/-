import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    // Isolate each test file in its own worker. Renderer modules that
    // touch IndexedDB (vault / library / fsa / proxy) install singletons
    // + global state via fake-indexeddb; sharing module graphs across
    // files causes flaky cross-file interactions. `isolate: true` is the
    // vitest default but we set it explicitly for clarity. We stay on
    // the default thread pool (threads) which works on CI's typically
    // resource-constrained runners — `forks` is heavier and unnecessary
    // here.
    isolate: true,
  },
});
