import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // 単体テストは実物の electron を読まない (Electron 本体無しで走る。ci.yml は取得を止めた)。
    // 読んだテストは環境で結果が変わるのではなく、どこでも同じ文言で落ちる —
    // src/shared/__tests__/electron.stub.ts を参照。vi.mock('electron', …) は alias より先に効く。
    alias: { electron: fileURLToPath(new URL('./src/shared/__tests__/electron.stub.ts', import.meta.url)) },
  },
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
