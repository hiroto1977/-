# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Service Hub — an Electron + React + TypeScript desktop dashboard skeleton that exposes nine third‑party
services (GitHub, WordPress.com, Atlassian, Notion, Google Drive, Google Calendar, Gmail, Slack, Canva)
through a unified sidebar UI. The renderer is built with Vite; the Electron main and preload processes
are bundled by `vite-plugin-electron`.

The app is currently a UI skeleton: each service page lists its planned features as cards. The shared
API clients in `src/shared/api/*` define the interface but throw `NotConfiguredError` until credentials
are wired up — implementations against each service's official REST API are intentionally deferred.

## Commands

```bash
npm install          # install deps
npm run dev          # launch Vite + Electron in development (hot reload)
npm run typecheck    # tsc -b --noEmit (uses tsconfig project references)
npm run build:renderer  # type-check + vite build only (no packaging)
npm run build        # full build: tsc -b, vite build, electron-builder package
npm run lint         # eslint . (no eslint config committed yet — add one before relying on this)
```

There is no test runner configured yet. When tests are introduced, document the single-test
invocation here.

## Architecture

Three TypeScript build contexts, kept separate via `tsconfig` project references:

- `src/main/` — Electron main process. `main.ts` creates the `BrowserWindow`, loads either the Vite
  dev server URL (`process.env.VITE_DEV_SERVER_URL`) or the built `dist/index.html`, and registers
  IPC handlers (`app:getVersion`, `app:openExternal`).
- `src/preload/` — Context‑isolated preload that exposes a typed `window.serviceHub` bridge via
  `contextBridge.exposeInMainWorld`. The bridge type is re‑declared globally in `src/shared/bridge.d.ts`
  so the renderer can call it without imports.
- `src/renderer/` — React app. `App.tsx` renders a sidebar driven by `services.ts`, which is the single
  source of truth for the service list (id, label, icon, description, page component). Adding a new
  service means: create a page in `src/renderer/pages/`, create an API client in `src/shared/api/`,
  and append an entry to `SERVICES`.

Page composition: every service page renders the shared `components/ServicePage.tsx`, passing an
`intro`, a `status` badge (`mock` / `connected` / `unconfigured`), and a `features` array. The card
grid, status badge, and "open external link" buttons are all handled by `ServicePage`. Keep service
pages declarative — push presentation logic into `ServicePage`, not into individual pages.

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
