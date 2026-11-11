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

- `index.ts` — thin bootstrap only: module side effects (paste protocol), `whenReady` lifecycle, window/tray creation, paste-manager init, `registerIpc()`.
- `ipc/` — one module per domain (`window`, `config`, `ai`, `usage`, `mcp`, `store`, `terminal`, `dialog`, `excalidraw`, `paste`, `chat`, `index`). `registerIpc()` registers every `ipcMain` handler.
- `ai/` — provider abstraction (`provider.ts`), OpenCode model catalog, web search adapters (`search/*`), live OpenCode usage client, and local usage ledger.
- `windows/` — `index.ts` owns all `BrowserWindow`/`Tray` state and window ops (create/show/hide/position/tray/shortcuts/paste protocol); `broadcast.ts` is the injected event bus so features can push to windows without importing window state.
- `chat/` (as `openai/`) — `client`, `messages` (sanitize/build params), `streaming`, `completion`, `title`.
- `features/` — domain CRUD/behavior: `preprompts`, `tasks`, `conversations`, `workflows`, `appLauncher`.
- `store/appStore.ts` — electron-store instance + `AppStoreSchema`.
- `config/configStore.ts` — `AppConfig`, `DEFAULT_CONFIG`, `normalizeConfig`, `readConfig`/`writeConfig`/`updateConfig`.
- `mcp/` — `servers` (persistence) and `registry` (active tools + Excalidraw bridge). `proxy.ts` — proxy resolution/session mirroring.
- `terminalManager.ts` (node-pty), `installedApps.ts`, `fontManager.ts`, `updater.ts`, `logger.ts`, `paste/` (clipboard history), `services/` (`mcpClient`, `mcpNormalizers`, `usageClient`, `taskEvaluator`, `argParser`).

### Bridge & renderer

- `src/preload/index.ts` — contextBridge exposes `window.api`. Every new IPC channel needs: a preload method, a `register*Ipc` handler in `src/main/ipc/`, and a matching declaration in `src/renderer/src/types/api.d.ts` (note: `api.d.ts` is a `.d.ts` and `skipLibCheck` is on, so it is not type-checked — keep it in sync manually).
- `src/shared/` — types/data shared across main/preload/renderer, grouped by domain: `config.ts` (model list, defaults, capability helpers — add new models here), `chat/` (`chat`, `chatNormalizers`, `excalidraw`), `tasks/` (`gamification`, `task`), `launcher/`, `mcp/`, `paste/`, `terminal/` (incl. `dimensions.ts`, the single source of truth for terminal bounds), `system/` (`update`, `usage`), `windows/` (`interactive` click-through rects), `domain/` (`preprompt`, `workflow`).
- `src/renderer/src/main.tsx` — routes between `App`, `Settings`, and `PasteManager` by URL hash (`#settings` / `#/settings`, `#paste`). No router library; window choice is hash-based.
- `src/renderer/src/app/` — command-bar pieces: `components/`, `hooks/`, `utils/`, `constants.ts`, `types.ts` (`App.tsx` itself stays at the renderer root).
- `src/renderer/src/settings/` — `Settings.tsx` + `constants.ts`, `icons.tsx`, `primitives.tsx`, `SecretField.tsx`, `shortcutRecorder.tsx`, `helpers.ts`, `tabs/` (General, Shortcuts, Providers & Keys, Web Search, Usage & Billing, Covenant Code, …), `usage/` (OpenAI/OpenCode panels + shared chart primitives), `modals/`.
- `src/renderer/src/types/renderer.ts` — barrel re-exporting shared domain types plus renderer-only types (`XpToastState`, `WorkflowExecutionState`). Import from here, not from `shared/*` directly, in the renderer.
- Other renderer folders: `ui/` (generic primitives + icons), `chat/`, `launcher/`, `workflow/`, `tasks/`, `terminal/`, `paste/`, `utils/`, `constants/`, `types/`.

## Gotchas

- OpenAI API key is main-process-only (loaded from `.env` via dotenv at `process.cwd()`). `get-config` redacts `apiKey`/`adminApiKey`; the renderer reads only `ai:key-status` and writes keys through `save-openai-settings`. Never expose them to the renderer.
- AI provider selection lives in `chatProvider` (`openai` / `opencode`) and is resolved by `src/main/ai/provider.ts`. The OpenCode key is encrypted with Electron `safeStorage` in `userData/code/auth.enc` and shared with Covenant Code. Never return it to the renderer.
- OpenCode models are fetched from `https://opencode.ai/inference/{go|}/v1/models` and cached in `src/main/ai/modelCatalog.ts`; the static fallback lives in `src/shared/ai/models.ts`.
- Web search defaults to `auto`: SearXNG when an endpoint is configured, then OpenCode native search for compatible models, then OpenAI. Explicit provider choices still win. Search credentials are encrypted under `userData/ai/`. The Raspberry Pi SearXNG guide is `docs/searxng-raspberry-pi.md`.
- Microphone and meeting transcription always use OpenAI, regardless of `chatProvider`. Do not gate chat on the OpenAI key when OpenCode is selected.
- OpenCode usage is read live from the Console API with the OpenCode API key (`/inference/go/v1/usage`, `/console/api/go/status`, `/console/api/usage/{summary,cost-by-day,models}`) in `src/main/ai/opencodeUsageClient.ts`. Parsers are pure in `src/shared/ai/opencodeUsage.ts`. The Settings OpenCode tab is real-data-only and does not display prepaid credits; the local ledger (`src/main/ai/usageLedger.ts`) is still recorded but no longer displayed there. The `/console/api/*` routes are unofficial, so each request degrades independently.
- `src/main/assets` is copied to `out/main/assets` at build time by a custom vite plugin (`copyAssetsPlugin`) — apply `build` only. The tray icon is loaded from `out/main/assets/tray-icon-light.png` / `tray-icon-dark.png` (macOS picks per menu bar appearance; other platforms always use `light`); adding assets requires a rebuild.
- Config (`AppConfig`) is persisted to `userData/config.json` via `readConfig`/`writeConfig`/`normalizeConfig` in `src/main/config/configStore.ts`. New settings must be added to `DEFAULT_CONFIG` and `normalizeConfig`; new app data must be added to the electron-store `schema`/`defaults` in `src/main/store/appStore.ts` (store name `preprompts`).
- Renderer IPC payloads are untrusted: main normalizes/sanitizes everything (see the `normalize*` helpers). Follow that pattern for new handlers.
- Chat streams via `covenant:chat-stream` (returns `{ id }`); events pushed on `covenant:chat-stream-event` (`content` / `reasoning` / `done` / `error` / `sources` / ...). Cancel via `covenant:chat-cancel` (streams tracked in `src/main/ipc/chat.ts`).
- MCP is JSON-RPC over HTTP: URL auto-appends `/mcp`, sessions tracked via `mcp-session-id` header.
- Platform-specific code (`isWindows` / `isMac`) is expected; CMD workflows are Windows-only.
- Windows main window is frameless/transparent/always-on-top; on macOS transparency is done via backgroundColor, never vibrancy.

## Git

Conventional commits (`feat:`, `fix:`, `chore:`, `refactor:`); version bumps are separate `chore:` commits (see `package.json` `version`).
