# AGENTS.md

Electron 41 + React 18 + TypeScript app ("Covenant" — a floating command bar). Repo folder is `Prometheus`, but the package name is `covenant`; the app is branded Covenant everywhere.

## Commands

- `npm run dev` — electron-vite dev (main + preload + renderer, HMR)
- `npm run build` — compiles to `out/`
- `npm start` — `electron .`; requires a prior `build`
- `npm run dist` — packages installer via electron-builder
- No lint or test tooling exists. Typecheck manually: `npx tsc --noEmit` (tsconfig is `strict`, `noEmit` already set)

## Structure

- `src/main/index.ts` — monolithic main process (~3000 lines): all `ipcMain` handlers, config persistence, OpenAI chat/streaming, MCP client, workflow runner, app launcher, windows/tray.
- `src/main/terminalManager.ts` — node-pty sessions; `fontManager.ts` — system font enumeration.
- `src/preload/index.ts` — contextBridge exposes `window.api` (and a legacy `window.electronAPI`). Every new IPC channel needs: a preload method, an `ipcMain.handle`/`on` in main, and matching type declarations here.
- `src/shared/` — types shared across main/preload/renderer. Model list, defaults, and capability helpers (`modelSupportsWebSearch`, `modelDoesReasoning`) live in `src/shared/config.ts`; add new models there.
- `src/renderer/src/main.tsx` — routes between `App` (command bar) and `Settings` (separate BrowserWindow) by URL hash `#settings` / `#/settings`. There is no router library; window choice is hash-based.

## Gotchas

- OpenAI API key is main-process-only (loaded from `.env` via dotenv at `process.cwd()`). Never expose it to the renderer.
- `src/main/assets` is copied to `out/main/assets` at build time by a custom vite plugin (`copyAssetsPlugin`) — apply `build` only. The tray/window icon is loaded from `out/main/assets/tray-icon.png`; adding assets requires a rebuild.
- `app.commandLine.appendSwitch('js-flags', '--expose_gc')` must stay at module top level, before `app.whenReady()` (used to force GC on window hide).
- Config (`AppConfig`) is persisted to `userData/config.json` via `readConfig`/`writeConfig`/`normalizeConfig`. New settings must be added to `DEFAULT_CONFIG`, `normalizeConfig`, and the electron-store `schema` (for app data: preprompts/apps/workflows/conversations, stored under electron-store name `preprompts`).
- Renderer IPC payloads are untrusted: main normalizes/sanitizes everything (see `normalize*` helpers). Follow that pattern for new handlers.
- Chat streams via `covenant:chat-stream` (returns `{ id }`); events pushed on `covenant:chat-stream-event` (`content` / `reasoning` / `done` / `error` / `sources` / ...).
- MCP is JSON-RPC over HTTP: URL auto-appends `/mcp`, sessions tracked via `mcp-session-id` header.
- Platform-specific code (`isWindows` / `isMac`) is expected; CMD workflows are Windows-only.
- Windows main window is frameless/transparent/always-on-top; on macOS transparency is done via backgroundColor, never vibrancy.

## Git

Conventional commits (`feat:`, `fix:`, `chore:`, `refactor:`); version bumps are separate `chore:` commits (see `package.json` `version`).