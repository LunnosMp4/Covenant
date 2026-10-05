# AGENTS.md

Electron 41 + React 18 + TypeScript app ("Covenant" — a floating command bar). Repo folder is `Prometheus`, but the package name is `covenant`; the app is branded Covenant everywhere.

## Commands

- `npm run dev` — electron-vite dev (main + preload + renderer, HMR)
- `npm run build` — compiles to `out/`
- `npm start` — `electron .`; requires a prior `build`
- `npm run dist` — packages installer via electron-builder
- `npm run typecheck` — `tsc --noEmit` (tsconfig is `strict`, `noEmit` already set)
- `npm test` / `npm run test:watch` — Vitest (`vitest.config.ts`, `src/**/*.test.{ts,tsx}`)

CI runs typecheck, tests, and a build on Windows/macOS/Linux (`.github/workflows/ci.yml`).

## Structure

### Main process (`src/main/`)

- `index.ts` — thin bootstrap only: module side effects (`--expose_gc`, paste protocol), `whenReady` lifecycle, window/tray creation, paste-manager init, `registerIpc()`.
- `ipc/` — one module per domain (`window`, `config`, `usage`, `mcp`, `store`, `terminal`, `dialog`, `excalidraw`, `paste`, `chat`, `index`). `registerIpc()` registers every `ipcMain` handler.
- `windows/` — `index.ts` owns all `BrowserWindow`/`Tray` state and window ops (create/show/hide/position/tray/shortcuts/paste protocol); `broadcast.ts` is the injected event bus so features can push to windows without importing window state.
- `chat/` (as `openai/`) — `client`, `messages` (sanitize/build params), `streaming`, `completion`, `title`.
- `features/` — domain CRUD/behavior: `preprompts`, `tasks`, `conversations`, `launcherApps`, `workflows`, `appLauncher`.
- `store/appStore.ts` — electron-store instance + `AppStoreSchema`.
- `config/configStore.ts` — `AppConfig`, `DEFAULT_CONFIG`, `normalizeConfig`, `readConfig`/`writeConfig`/`updateConfig`.
- `mcp/` — `servers` (persistence) and `registry` (active tools + Excalidraw bridge). `proxy.ts` — proxy resolution/session mirroring.
- `terminalManager.ts` (node-pty), `installedApps.ts`, `fontManager.ts`, `updater.ts`, `logger.ts`, `paste/` (clipboard history), `services/` (`mcpClient`, `mcpNormalizers`, `usageClient`, `taskEvaluator`, `argParser`).

### Bridge & renderer

- `src/preload/index.ts` — contextBridge exposes `window.api`. Every new IPC channel needs: a preload method, a `register*Ipc` handler in `src/main/ipc/`, and a matching declaration in `src/renderer/src/types/api.d.ts` (note: `api.d.ts` is a `.d.ts` and `skipLibCheck` is on, so it is not type-checked — keep it in sync manually).
- `src/shared/` — types/data shared across main/preload/renderer, grouped by domain: `config.ts` (model list, defaults, capability helpers — add new models here), `chat/` (`chat`, `chatNormalizers`, `excalidraw`), `tasks/` (`gamification`, `task`), `launcher/`, `mcp/`, `paste/`, `terminal/` (incl. `dimensions.ts`, the single source of truth for terminal bounds), `system/` (`update`, `usage`), `domain/` (`preprompt`, `workflow`).
- `src/renderer/src/main.tsx` — routes between `App`, `Settings`, and `PasteManager` by URL hash (`#settings` / `#/settings`, `#paste`). No router library; window choice is hash-based.
- `src/renderer/src/app/` — command-bar pieces: `components/`, `hooks/`, `utils/`, `constants.ts`, `types.ts` (`App.tsx` itself stays at the renderer root).
- `src/renderer/src/settings/` — `Settings.tsx` + `constants.ts`, `icons.tsx`, `primitives.tsx`, `shortcutRecorder.tsx`, `helpers.ts`, `tabs/`, `modals/`.
- `src/renderer/src/types/renderer.ts` — barrel re-exporting shared domain types plus renderer-only types (`XpToastState`, `WorkflowExecutionState`). Import from here, not from `shared/*` directly, in the renderer.
- Other renderer folders: `ui/` (generic primitives + icons), `chat/`, `launcher/`, `workflow/`, `tasks/`, `terminal/`, `paste/`, `utils/`, `constants/`, `types/`.

## Gotchas

- OpenAI API key is main-process-only (loaded from `.env` via dotenv at `process.cwd()`). Never expose it to the renderer.
- `src/main/assets` is copied to `out/main/assets` at build time by a custom vite plugin (`copyAssetsPlugin`) — apply `build` only. The tray/window icon is loaded from `out/main/assets/tray-icon.png`; adding assets requires a rebuild.
- `app.commandLine.appendSwitch('js-flags', '--expose_gc')` must stay at module top level of `src/main/index.ts`, before `app.whenReady()` (used to force GC on window hide).
- Config (`AppConfig`) is persisted to `userData/config.json` via `readConfig`/`writeConfig`/`normalizeConfig` in `src/main/config/configStore.ts`. New settings must be added to `DEFAULT_CONFIG` and `normalizeConfig`; new app data must be added to the electron-store `schema`/`defaults` in `src/main/store/appStore.ts` (store name `preprompts`).
- Renderer IPC payloads are untrusted: main normalizes/sanitizes everything (see the `normalize*` helpers). Follow that pattern for new handlers.
- Chat streams via `covenant:chat-stream` (returns `{ id }`); events pushed on `covenant:chat-stream-event` (`content` / `reasoning` / `done` / `error` / `sources` / ...). Cancel via `covenant:chat-cancel` (streams tracked in `src/main/ipc/chat.ts`).
- MCP is JSON-RPC over HTTP: URL auto-appends `/mcp`, sessions tracked via `mcp-session-id` header.
- Platform-specific code (`isWindows` / `isMac`) is expected; CMD workflows are Windows-only.
- Windows main window is frameless/transparent/always-on-top; on macOS transparency is done via backgroundColor, never vibrancy.

## Git

Conventional commits (`feat:`, `fix:`, `chore:`, `refactor:`); version bumps are separate `chore:` commits (see `package.json` `version`).
