# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **🆕 セッション引継ぎ:** 新しい Claude Code セッションを開始した場合、
> まず [`docs/SESSION_HANDOFF.md`](docs/SESSION_HANDOFF.md) を読んでください。
> 進行中タスク・確立されたパターン・既知の罠・残作業を簡潔にまとめています。
> `.claude/settings.json` の SessionStart hook (`scripts/session-context.cjs`)
> が自動でこのファイルの存在を案内します。

## Project

Service Hub — a Japanese-facing business dashboard exposing **68 services** through a unified,
category-grouped sidebar (おすすめ / 分析・ツール / 外部サービス連携). Services span third-party SaaS
(GitHub, WordPress.com, Atlassian, Notion, Google Drive / Calendar / Gmail, Slack, Canva,
Microsoft 365, Dropbox, Salesforce, Discord, Asana, Linear, Sentry, Shopify, Stripe, LINE), local
tools (Skills, Security, Cloudflare, Emotions, Ollama, KPI, Stocks, Storage), business operations
(Home, Business Dashboard, Team Radar, Templates, Library, Settings, Quality), food delivery
(Uber Eats, 出前館), investment (Real Estate 不動産投資, Mutual Funds 投資信託) and seven 士業
professional integrations (税理士 / 社労士 / 弁護士 / 司法書士 / 行政書士 / 中小企業診断士 / 弁理士).

**Two runtime targets ship from the same codebase:**
1. **Electron desktop app** (`npm run dev` / `npm run build`) — full OS integration, 3-process model.
2. **Browser standalone** (`npm run build:web` → `dist/standalone.html`) — a single self-contained HTML
   file (~510 KB) that runs in any browser with no Node/Electron. See `docs/BROWSER_REDESIGN.md`.

Each service page starts from a static snapshot in `src/renderer/data/snapshot.ts` and can swap to a
live REST fetch. The `useServiceData(serviceId, snapshot)` hook returns `data`, `source`
(`'snapshot'` | `'live'`), `status`, `errorMessage`, and `refresh()`.

## Commands

```bash
npm install              # install deps
npm run dev              # Vite + Electron, hot reload (desktop dev)
npm run build:web        # → dist/standalone.html (browser build; runs inline-html.cjs)
npm run build:renderer   # tsc -b + vite build only (no packaging)
npm run build            # full desktop build: tsc -b, vite build, electron-builder installers
npm run typecheck        # tsc -b --noEmit --force (uses tsconfig project references)
npm test                 # vitest run (~1460 tests under src/**/__tests__/)
npm run test:watch       # vitest watch mode
npm run lint             # eslint . (flat config in eslint.config.js, ESLint 9 + typescript-eslint)
npm run smoke            # xvfb + Electron screenshot smoke test of every page
npm run scaffold -- <id> "<Label>" <ICON> [bearer|oauth|json]   # generate a new service end-to-end
```

Run a single test: `npx vitest run path/to/file.test.ts`, or filter by name: `npx vitest run -t "pattern"`.
Vitest config is in `vitest.config.ts` (node environment).

### Custom quality gates (all run in CI — keep them green)

```bash
npm run verify:arch        # docs/ARCHITECTURE.md file:line refs + live metrics must match reality
npm run lint:imports       # main / preload / renderer import-boundary enforcement
npm run lint:forbidden     # forbidden patterns (e.g. nodeIntegration: true, contextIsolation: false)
npm run lint:docs          # cross-document consistency
npm run lint:test-coverage # every service must have a test + an action registered
npm run lint:shell         # scripts/*.sh: bash -n syntax + strict mode (set -euo pipefail)
npm run verify:all         # all of the above (verify:arch + lint:forbidden/imports/docs/test-coverage/shell)
npm run mutate             # Stryker mutation testing (target: 100%); mutate:triage / mutate:next help
```

These are plain Node scripts in `scripts/` — there is no AST parser dependency; they grep marker
comments and source. `verify:arch` will fail if you change architecture without updating
`docs/ARCHITECTURE.md`. CI (`.github/workflows/ci.yml`) runs a single consolidated job on push to
`main` and PRs to `main` (one `npm ci`, then typecheck + all verify/lint, vitest + coverage, and
`build:web` asserting `dist/standalone.html` is generated and non-trivial) — collapsed from 3 jobs
to 1 to minimize GitHub Actions minutes on the free tier.
`.github/workflows/release.yml` builds Mac/Win/Linux installers on `v*` tags;
`mutation.yml` runs Stryker.

## Architecture

Three TypeScript build contexts, kept separate via `tsconfig` project references:

- **`src/main/`** — Electron main process. `main.ts` creates the `BrowserWindow` and registers IPC
  handlers (`app:*`, `secrets:*`, `fetch:snapshot`, action invoke). `secrets.ts` persists tokens in
  the Electron `userData` dir, encrypted with `safeStorage` when the OS keychain is available
  (base64 fallback so Linux dev without a keychain still works). `oauth.ts` implements a real OAuth
  2.0 Authorization-Code + PKCE flow via a loopback `127.0.0.1` HTTP server (RFC 7636 / 8252); pure
  helpers (PKCE gen, URL building, token-request body) are exported for unit tests. Live REST clients
  live under `src/main/clients/`.
- **`src/preload/`** — Context-isolated preload exposing a typed `window.serviceHub` bridge via
  `contextBridge.exposeInMainWorld`. The bridge type is re-declared globally in
  `src/shared/bridge.d.ts` so the renderer calls it without imports.
- **`src/renderer/`** — React app. `App.tsx` renders the category-grouped sidebar from `SERVICES`
  (`services.ts`). The renderer never sees raw tokens — it only calls
  `serviceHub.setToken / clearToken / listConfigured / fetchSnapshot / invoke / openExternal`.

### The single source of truth for services

`src/shared/serviceId.ts` exports the `SERVICE_IDS` array and `ServiceId` union — **this is the one
true list**, imported by `services.ts` (sidebar), `clients/index.ts` (fetchers), and the preload
bridge. Three parallel maps in `src/main/clients/index.ts` are keyed by `ServiceId`:

- `LIVE_FETCHERS` — a **total** `Record<ServiceId, fetcher>`. A runtime invariant at module load
  throws if any `ServiceId` is missing an entry, so a forgotten service crashes loudly at app start
  rather than on first click. Note: many entries are static stubs (investment, 士業, food delivery)
  that just satisfy the invariant and return `SNAPSHOT[id]` directly — only the SaaS clients do real
  network I/O.
- `LOCAL_SERVICES` — services whose fetcher reads local resources and needs no saved credentials
  (a missing token is not an error for these).
- `LIVE_ACTIONS` — `Partial<Record<ServiceId, ActionMap>>` of write-side actions, invoked from the
  renderer via `serviceHub.invoke()`.

### Adding a service

**Use the scaffolder** — don't wire services by hand:

```bash
npm run scaffold -- <id> "<Label>" <ICON> [bearer|oauth|json]
```

It creates the client + test + page and patches `serviceId.ts`, `clients/index.ts`, `services.ts`,
and `snapshot.ts` by inserting at `// SCAFFOLD:ADD_*` marker comments. `auth-kind`: `bearer` (PAT/API
token → `Authorization: Bearer`), `oauth` (OAuth access token, same wire as bearer), `json`
(`{email,token,site}` Basic auth, e.g. Atlassian). Then fill the TODOs in the generated client, run
`npm run typecheck && npm test`, and `git checkout` the patched files to undo. Full guide:
`docs/ADDING_A_SERVICE.md`.

### Page composition

Each service page calls `useServiceData(id, SNAPSHOT[id])` and renders with the shared
`components/StatusBar.tsx` (unified refresh button + optional `tokenSetup` credential slot) +
`Section` + `components/DataList.tsx` (cards with thumbnail / meta / badge / open-external). Keep
pages declarative — if a visual primitive is needed by more than one page, add it under `components/`.

### Live fetcher contract

A fetcher takes `{ token, fetch? }` and returns a value with the same shape as `SNAPSHOT[id]`.
`fetch` is injectable so fetchers are unit-testable under Node without a network. See
`src/main/clients/github.ts` and its `__tests__/github.test.ts` (mock with `vi.fn<typeof fetch>()`).

### API clients (`src/shared/api/*.ts`)

Framework-agnostic classes implementing `ServiceClient` (`id`, `isConfigured()`). Credentialed
methods must guard with `if (!this.isConfigured()) throw new NotConfiguredError(this.id);` before any
network call, so they can run from either the renderer or main depending on whether the token must
stay out of the renderer.

### Browser standalone layer (`build:web`)

The browser target adds: `web-shim.ts` (a `window.serviceHub` polyfill imported first in `main.tsx`),
`web-templates.ts`, and a client-side security/storage stack under `src/renderer/`:

- `security/vault.ts` — WebCrypto AES-GCM-256 with a PBKDF2-SHA-256 (600k iter) key derived from the
  master password; key is `extractable: false`, memory-only. `LockScreen.tsx` + `autoLock.ts` lock on
  tab-hidden / idle.
- `library/library.ts` — IndexedDB blob store. `fs/fsa.ts` — File System Access API wrapper.
- `network/proxy.ts` — routes CORS-blocked APIs (Notion / Atlassian / Cloudflare) through a
  user-supplied Cloudflare Worker (`docs/PROXY_EXAMPLE.md`). `oauth/pkce.ts` — out-of-band paste PKCE
  for `file://`.

`scripts/inline-html.cjs` inlines CSS/JS into `dist/standalone.html`. Vite (`vite.config.ts`) has
`root: 'src/renderer'`, renderer build → repo-root `dist/`, Electron bundles → `dist-electron/`
(both gitignored).

## Conventions

- `window.serviceHub` is the **only** sanctioned way to call into the main process. Do not add
  `nodeIntegration: true` or remove `contextIsolation` — extend the preload bridge instead
  (`lint:forbidden` enforces this).
- External links must go through `window.serviceHub.openExternal(url)` (→ `shell.openExternal`), never
  `window.open`, so the OS browser handles them.
- Add new service IDs to `SERVICE_IDS` in `src/shared/serviceId.ts` (not `services.ts`) — the type
  system then flags every dependent switch/lookup, and prefer `npm run scaffold` over manual edits.
- When you change architecture, update `docs/ARCHITECTURE.md` too — `verify:arch` checks its
  `file:line` references and metrics against the real tree.

## Branching

Active development for Claude Code sessions happens on the branch designated in the task prompt
(e.g. `claude/claude-md-docs-qqUAT`). The default branch is `main`.
