import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    // Isolate each test file in its own forked process. Renderer
    // modules that touch IndexedDB (vault / library / fsa / proxy)
    // install singletons + global state via fake-indexeddb. Threads
    // pool shares the parent V8 isolate; on CI's 2-core runners that
    // causes cross-file race conditions in the fake IDB queue. Forks
    // give us a separate process per file, fully isolating fake-IDB
    // global state and the `@vitest-environment jsdom` switch.
    isolate: true,
    pool: 'forks',
  },
});
