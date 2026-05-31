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
    // Phase E recovery tests do up to 4 PBKDF2-SHA-256 600k iter derivations
    // per test (initialize → recover → unlock). At ~1s each on CI, that's
    // 4s minimum; raise from 5s default to give headroom.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // CI's 2-core runners occasionally lose a fake-IndexedDB race even with
    // forks (the global IDB queue / structured-clone timing under load), which
    // surfaces as a single flaky file failure — observed as one of two
    // identical `test` jobs failing for the same commit. A bounded retry
    // self-heals these transient races WITHOUT masking real regressions: a
    // genuine bug fails deterministically and still fails all attempts.
    retry: process.env.CI ? 2 : 0,
  },
});
