# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Service Hub — an Electron + React + TypeScript desktop dashboard skeleton that exposes 45 services
across third‑party SaaS (GitHub, WordPress.com, Atlassian, Notion, Google Drive / Calendar / Gmail,
Slack, Canva), local tools (Skills, Security, Cloudflare, Emotions, Ollama, KPI, Stocks), business
operations (Home, Business Dashboard, Team Radar, Templates, Library, Settings), food delivery
(Uber Eats, 出前館 — snapshot only) and investment (Real Estate 不動産投資, Mutual Funds 投資信託 —
snapshot only) through a unified sidebar UI. The renderer is built with Vite; the Electron main and preload processes
are bundled by `vite-plugin-electron`.

Each service page starts from a static snapshot in `src/renderer/data/snapshot.ts` (regenerated
manually by running MCP tools) and can swap to a live REST fetch via the main‑process clients in
`src/main/clients/*`. The `useServiceData(serviceId, snapshot)` hook in `src/renderer/hooks/`
manages this: it returns `data`, `source` (`'snapshot'` | `'live'`), `status`, `errorMessage`, and
`refresh()`. All nine services have live fetchers registered in `LIVE_FETCHERS`. Auth varies:
GitHub/Notion/Slack/Drive/Calendar/Gmail/Canva/WordPress take a single Bearer token;
Atlassian takes a JSON blob `{"email","token","site"}` (Basic auth + site URL). Real OAuth code
flow isn't implemented — users obtain access tokens out‑of‑band (e.g. Google OAuth Playground,
Notion integration token, Slack workspace token) and paste them into the page.

Tokens are persisted in the user's Electron `userData` directory via `src/main/secrets.ts`, which
encrypts them with `safeStorage` when the OS keychain is available (and falls back to a
plain‑base64 layout otherwise, so dev on Linux without keychain still works). Renderer never sees
the raw token — it only calls `serviceHub.setToken / clearToken / listConfigured / fetchSnapshot`.

## Commands

```bash
npm install          # install deps
npm run dev          # launch Vite + Electron in development (hot reload)
npm run typecheck    # tsc -b --noEmit (uses tsconfig project references)
npm run build:renderer  # type-check + vite build only (no packaging)
npm run build        # full build: tsc -b, vite build, electron-builder package
npm run lint         # eslint . (no eslint config committed yet — add one before relying on this)
npm test             # vitest run (all *.test.ts under src/**/__tests__/)
npm run test:watch   # vitest watch mode
```

Run a single test with `npx vitest run path/to/file.test.ts` or filter by name with
`npx vitest run -t "pattern"`. Vitest config is in `vitest.config.ts` (node environment).

CI: `.github/workflows/ci.yml` runs typecheck + test + build:renderer on every push to
main / `claude/**` and on PRs to main. `.github/workflows/release.yml` builds Mac / Win /
Linux installers in parallel on `v*` tag pushes and attaches them to a GitHub Release.

## Architecture

Three TypeScript build contexts, kept separate via `tsconfig` project references:

- `src/main/` — Electron main process. `main.ts` creates the `BrowserWindow` and registers IPC
  handlers (`app:*`, `secrets:*`, `fetch:snapshot`). Token persistence lives in `secrets.ts`
  (`safeStorage`‑backed). Live REST clients live under `src/main/clients/`; each exports a function
  `(ctx: FetchContext) => Promise<NormalizedSnapshot>` and is registered in `clients/index.ts`'s
  `LIVE_FETCHERS` map keyed by `ServiceId`.
- `src/preload/` — Context‑isolated preload that exposes a typed `window.serviceHub` bridge via
  `contextBridge.exposeInMainWorld`. The bridge type is re‑declared globally in `src/shared/bridge.d.ts`
  so the renderer can call it without imports.
- `src/renderer/` — React app. `App.tsx` renders a sidebar driven by `services.ts`, which is the single
  source of truth for the service list (id, label, icon, description, page component). Adding a new
  service means: create a page in `src/renderer/pages/`, create an API client in `src/shared/api/`
  (stub) and/or a live fetcher in `src/main/clients/`, register the fetcher in `LIVE_FETCHERS`,
  and append an entry to `SERVICES`.

Page composition: each service page calls `useServiceData(id, SNAPSHOT[id])` and renders the result
with the shared `components/StatusBar.tsx` + `Section` (header + count) + `components/DataList.tsx`
(cards with optional thumbnail, meta, badge, and "open external" button). `StatusBar` exposes a
unified refresh button plus an optional `tokenSetup` slot for password‑input‑style credential
entry. Keep service pages declarative — if a new visual primitive is needed by more than one page,
add it under `components/` rather than duplicating markup.

Live fetcher contract: a fetcher takes `{ token, fetch? }` and returns a value with the same shape
as the corresponding `SNAPSHOT[id]` slice. `fetch` is injectable so the function is unit‑testable
under Node without a real network. See `src/main/clients/github.ts` for the reference implementation
and `src/main/clients/__tests__/github.test.ts` for the testing pattern (mock fetch with
`vi.fn<typeof fetch>()`).

API clients (`src/shared/api/*.ts`): each exports a class implementing `ServiceClient` (`id`,
`isConfigured()`). Methods that need credentials must guard with `if (!this.isConfigured()) throw new
NotConfiguredError(this.id);` before any network call. The clients are framework‑agnostic so they can
later be invoked from either the renderer (direct fetch) or the main process (via IPC) — pick the
location based on whether the API requires secret tokens that must not reach the renderer.

Vite config (`vite.config.ts`) has `root: 'src/renderer'` and `build.outDir: '../../dist'`, so the
renderer build lands at repo‑root `dist/`. The Electron bundles land at `dist-electron/`. Keep these
directories in `.gitignore`.

## Conventions

- The `serviceHub` global in the renderer is the only sanctioned way to call into the main process.
  Do not add `nodeIntegration: true` or remove `contextIsolation` — extend the preload bridge instead.
- External links must go through `window.serviceHub.openExternal(url)` (which calls
  `shell.openExternal`) rather than `window.open`, so the OS browser handles them.
- Service identity is the `ServiceId` union in `src/renderer/services.ts`. Update that union when
  adding a service so the type system flags every dependent switch / lookup.

## Branching

Active development for Claude Code sessions happens on the branch designated in the task prompt
(e.g. `claude/add-claude-documentation-F7HIa`). The default branch is `main`.
