# Covenant performance playbook

A guide for any agent asked to "make Covenant use less CPU/RAM, run smoother,
reduce build size" **without changing what the app looks like or how it
behaves**.

Read `docs/PERFORMANCE.md` first for the results of the last pass. This document
is the how-to: the rules, the measurement loop, what is already done, what is
left, and the traps that will break the app if you get them wrong.

---

## 0. The one rule

> If a change can alter a pixel, a timing the user can perceive, an IPC
> contract, a stored data format, or a keyboard/gesture flow, it is **not** a
> performance change. Find another way.

Safe in this codebase:

- build configuration (minify, chunking, aliasing never-executed code)
- removing code nothing imports
- caching the result of a pure computation
- coalescing repeated I/O (disk writes, IPC messages)
- bounding collections that grow forever
- replacing O(n²) with O(n)
- exact-equivalent refactors of duplicated code

Not safe without explicit user approval:

- changing the auto-collapse delay, animation springs, `requestIdleCallback`
  timeouts that gate visible content, or stream flush intervals
- virtualising a list that is not virtualised today (scroll behaviour changes)
- changing a store file layout without a migration path
- swapping a rendering library (KaTeX, ECharts, xterm, CodeMirror)

---

## 1. Measurement loop (do this before touching anything)

Electron usually cannot be launched in CI/containers (no GTK/display). Do not
pretend to measure runtime CPU you cannot observe. Use these four layers:

### 1.1 Capture a baseline first

```bash
npm run build
node scripts/perf-report.mjs --save perf/baseline.json
```

`perf-report.mjs` records renderer/main/preload bytes, gzip sizes, the *static
import closure* of the entry (the code needed before first paint), per-extension
font weight and the largest chunks.

### 1.2 Build the old commit side by side

The only honest before/after is two real builds:

```bash
git worktree add /tmp/covenant-baseline <commit-before-your-changes>
ln -s "$PWD/node_modules" /tmp/covenant-baseline/node_modules
(cd /tmp/covenant-baseline && npm run build)
```

Never measure "before" from memory or by scaling bytes — V8 parse cost is not
perfectly linear once code is minified.

### 1.3 Measure what the engine does, not just bytes

```bash
node --experimental-vm-modules --expose-gc scripts/measure-bundle.cjs out
```

Reports, for the critical path / all renderer chunks / main:

- bytes
- **median V8 parse+compile time** (`vm.SourceTextModule`)
- **heap retained** after compiling every chunk

This is the number to quote when someone asks "will the user feel it?".

### 1.4 Measure the packaged artifact

```bash
npx electron-builder --dir --linux --publish never \
  --config.directories.output=/tmp/dist
stat -c %s /tmp/dist/linux-arm64-unpacked/resources/app.asar
```

`app.asar` is what the installer actually contains. Renderer-only dependencies
are bundled by Vite and must **not** also ship in `node_modules` — that is what
`dependencies` vs `devDependencies` in `package.json` controls now.

### 1.5 Compare and record

```bash
node scripts/perf-compare.mjs perf/baseline.json perf/final.json
```

Commit the resulting `perf/*.json` next to the report.

---

## 2. Verification gate (must pass before declaring done)

```bash
npm run typecheck     # tsc --noEmit  (strict)
npm test              # vitest
npm run build
```

Then two integrity checks that catch the failure modes this repo actually has:

```bash
# Every external require in the main bundle must resolve from node_modules
node -e '
const fs=require("fs"),path=require("path"),{createRequire}=require("module"),{builtinModules}=require("module");
const req=createRequire(path.resolve("out/main/index.js"));
const src=fs.readFileSync("out/main/index.js","utf8");
const specs=[...new Set([...src.matchAll(/(?:require|import)\("([^"]+)"\)/g)].map(m=>m[1]))]
  .filter(n=>!n.startsWith("node:")&&!builtinModules.includes(n)&&!n.startsWith("."));
for(const n of specs){try{req.resolve(n)}catch(e){ if(n!=="@opencode/client") console.log("MISSING",n) }}
'

# Every dynamic chunk reference in the renderer must exist on disk
node -e '
const fs=require("fs"),path=require("path");
const dir="out/renderer/assets";let missing=0;
for(const f of fs.readdirSync(dir).filter(f=>f.endsWith(".js"))){
  const t=fs.readFileSync(path.join(dir,f),"utf8");
  for(const m of t.matchAll(/["\x27](\.\/[A-Za-z0-9_.-]+\.js)["\x27]/g))
    if(!fs.existsSync(path.join(dir,m[1]))){missing++;console.log("MISSING",m[1],"from",f)}
}
console.log(missing,"missing");'
```

`@opencode/client` is ESM-only, so `require.resolve` legitimately fails for it;
the bundled code uses `await import("@opencode/client")`, which works. Confirm it
is inside the packaged `app.asar` before shipping.

---

## 3. Current build architecture (know this before optimizing)

```
index.html
  └─ index-*.js         react + react-dom + scheduler (entry, always parsed)
       └─ App-*.js      command bar (dynamic import, needed immediately)
            ├─ config-*.js        framer-motion + shared model catalog
            ├─ describe-*.js      UI-spec -> text
            └─ lazy surfaces      TerminalView, ChatTranscript (+ AssistantMarkdown),
                                  CodePanel, PasteSurface, NotesSurface
Settings window loads Settings-*.js and its tabs lazily.
UiLab window (#ui-lab) is separate.
```

- `src/renderer/src/main.tsx` routes by URL hash and dynamically imports one of
  the three roots. Keep it that way: adding a static import of `Settings` or the
  chat stack to `main.tsx` would put it on the critical path of every window.
- `src/main/index.ts` is a thin bootstrap; IPC modules are registered eagerly by
  `src/main/ipc/index.ts`. The main bundle is minified, single-file CJS.
- The generated-UI sandbox (`src/renderer/public/sandbox/`) is built separately
  by esbuild in `electron.vite.config.ts` and must stay plain IIFE scripts.

---

## 4. Already done — do not redo

### Build
- `build.minify: 'esbuild'` for **main, preload and renderer**
  (electron-vite defaults it to `false`; verify before assuming).
- Mermaid aliased to `src/renderer/shims/mermaid.ts`; the Excalidraw
  Mermaid-to-Excalidraw package is stubbed too.
- Excalidraw locale chunks, `subset-shared`/`subset-worker` (1.8 MB HarfBuzz) are
  resolved to virtual stubs by `dropExcalidrawDeadPathsPlugin`.
- KaTeX `woff`/`ttf` `@font-face` sources stripped by
  `dropLegacyFontFormatsPlugin` (woff2 always wins on Chromium).
- Renderer-bundled dependencies live in `devDependencies`; only main-process
  runtime deps remain in `dependencies`.

### Main process
- `configStore.readConfig()` caches the parsed config and revalidates the mtime
  at most once per second (`CONFIG_MTIME_TTL_MS`).
- `usageLedger` writes are debounced (2 s) and flushed on quit; the ledger lives
  in its own `ai-usage` store (`src/main/store/usageStore.ts`) with a legacy seed
  from `preprompts`.
- `codeCredentials` and `search/credentials` cache decrypted secrets in memory.
- `proxyDispatcher` shares `ProxyAgent`/`Agent` instances (bounded to 8).
- `opencodeBinary` memoises the resolved binary and its `--version`.
- Delta batching: `src/main/streaming/deltaSender.ts` (chat + notes AI),
  `ipc/code.ts` (per-part 50 ms), `features/workflows.ts` (adjacent log chunks).
- Bounded caches: `CodeActivityTracker.sessions` 200, `LocalCodeEngine` session
  status 500, `preparedAudio` 512, `faviconCache` 200, `iconCache` 256.
- Paste purge/clear deletes files with `mapWithConcurrency(..., 16, ...)`.
- `readConfig` consumers in hot paths share one object rather than re-reading.

### Renderer
- Surface prefetch runs one chunk per idle slice (`SURFACE_PREFETCHERS`).
- `ChatTranscript` is memoised; its copy payload is skipped during streaming.
- `normalizeMessageOrder` returns the same array when already ordered.
- Chart table, code transcript cost and notes segment counters are memoised.
- Windows click-through uses `checkVisibility()` instead of `getComputedStyle`.
- Dead components/exports removed (see `docs/PERFORMANCE.md`).

---

## 5. Where the remaining wins are (ranked)

### 5.1 `appStore` rewrites the whole file on every `set` — biggest routine cost
`electron-store`/`conf` does `readFileSync` → `JSON.parse` → Ajv validate →
`JSON.stringify(value, null, '\t')` → temp file → `fsync` → rename **for every
`appStore.set(...)`**. The shared `preprompts` store holds conversations, tasks,
workflows, preprompts, code projects/connections and the legacy notes array.

Already split out: notes index (`store/notesIndexStore.ts`), usage ledger
(`store/usageStore.ts`).

Next candidates:
- conversations → one file per conversation, with an index
  (`features/conversations.ts`, capped at 20 but messages are unbounded).
- task/workflow/preprompt writes → a `mutateCollection(key, fn)` helper with a
  debounced writer. Several actions currently write twice (e.g.
  `clearCompletedTasks` and connection removal).
- **Migration rule**: use the `notesIndexStore` pattern — new store file, seed
  from the legacy key on first read, never write the legacy key again, leave it
  in place so a downgrade still works.

### 5.2 Clipboard watcher is a permanent synchronous poll
`paste/clipboardWatcher.ts` calls `clipboard.availableFormats()`, `readText()`
and re-reads + SHA-1s the whole image every 1.6 s while a large clip sits on the
clipboard. It is enabled by default. A cheap fix is an OS-level change token
(Windows `GetClipboardSequenceNumber`) or hashing only a bounded prefix; do not
simply raise the poll interval without checking how capture latency feels.

### 5.3 Notes autosave pipeline
`features/notes.ts` re-reads the note, re-normalises it, rewrites the whole
`note.json` (up to 2 MB) and rewrites the notes index every ~650 ms
(`NotesSurface` debounce). Meeting segments make this O(N²) across a recording.
Keep the active note in memory, write only on change, and update the index once
per meeting.

### 5.4 Streamed markdown re-parses the whole answer
`chat/AssistantMarkdown.tsx` is memoised on `content`, but `content` changes per
flush, so `react-markdown` + `rehype-katex` + Prism re-parse the entire answer.
Block-level memoisation (keep completed blocks stable, parse only the tail) is
the safe way to fix this — do **not** switch to plain text while streaming.

### 5.5 `App.tsx` re-renders on every streamed token
`activeConversation` is replaced per delta, so `App` re-renders and recomputes
`contextStats` (full message scan) and the auto-scroll effect (forced layout).
`useChatSearch` also rebuilds the DOM highlight while a search is open. Key
effects on `conversation.id` + message count, and move chat state into a
transcript-local store. Decomposing `App.tsx` (3.9k lines, 56 `useState`) is
worthwhile but must be done as pure moves with no behavioural diffs.

### 5.6 Long lists are fully rendered
`ChatTranscript`, `ConversationHistoryMenu`/`ChatHistorySidebar`,
`PasteSurface` (up to 1000 rows × thumbnails) and `NoteList` map everything.
Virtualisation changes scroll behaviour, so treat it as a product decision.

### 5.7 Sync filesystem/native work on the main thread
- `code/ssh/remoteBinary.ts` — `execFileSync('tar')` + `copyFileSync` of a ~100 MB
  binary during SSH provisioning.
- `code/opencodeBinary.ts` — `execFileSync('--version')` on first Code connect
  (now cached, still blocking once).
- `installedApps.ts` — `shell.readShortcutLink` synchronously per `.lnk`.
- `paste/pasteManager.ts` — image decode + double PNG encode per capture (when
  the image is already ≤ 480 px the same buffer is encoded twice).
- `ui/generatedValidation.ts` — PostCSS + parse5 + `new Script` per generated
  surface, on the main thread while a chat stream is live.

### 5.8 Bounded/leaky collections still left
- `ipc/code.ts` `serviceSubscribed` is never reset if the service is replaced.
- `notes/meetingRecorder.ts` sessions are not cleaned on `render-process-gone`.
- `mcpClient.mcpSessionIds` accumulates entries for test connections.
- `App.tsx` `thinkingOpenById` / `workflowExecutionById` / `launcherIcons` never
  drop keys for deleted entities.

### 5.9 Smaller items
- `opencodeRuntime` and `windows/index.ts` have uncleared `setTimeout`s
  (SIGKILL fallback, meeting badge auto-clear).
- `windows/index.ts` `registerShortcuts()` repeats the same 10-line block eight
  times — table-driven registration is a safe refactor.
- `configStore.normalizeButtonVisibility` is duplicated inline in
  `ipc/config.ts`.
- Settings tabs each import ~40 unused bindings (dead source, tree-shaken in
  production). Add an unused-import lint rule rather than fixing by hand.

---

## 6. Traps specific to this repo

1. **`electron-vite` defaults `build.minify` to `false`.** If someone "fixes"
   the config, check `node_modules/electron-vite/dist/chunks/*.js` for the
   defaults again before trusting it.
2. **Excalidraw is not a UI dependency here.** `Chat/ExcalidrawEmbed.tsx` only
   calls `convertToExcalidrawElements` / `serializeAsJSON` / `FONT_FAMILY` and
   hands the JSON to excalidraw.com in an iframe. Everything else in the package
   (editor, locales, Mermaid, HarfBuzz export, pica/image-blob-reduce) is dead
   weight. Do not "restore" it.
3. **KaTeX version mismatch is intentional/legacy.** Root `katex@0.18.1` CSS is
   imported while `rehype-katex` bundles `0.16.47` JS. Aligning versions changes
   math rendering — do not do it as a "cleanup".
4. **`api.d.ts` is not type-checked** (`skipLibCheck`). Every new IPC channel
   needs: preload method + `register*Ipc` handler + `types/api.d.ts` entry.
5. **The generated-UI sandbox must stay a real `file:` document** written by
   `buildSandboxRuntimePlugin`. A `blob:` document inherits the app CSP and is
   blocked; a `file:` subresource is blocked for sandboxed frames in packaged
   builds. The runtime is inlined into `frame.html` on purpose.
6. **Never expose `apiKey` / `adminApiKey` / the OpenCode key to the renderer.**
   `get-config` redacts them; cache secrets in the main process only.
7. **Config and store changes need migrations.** `AppConfig` → `DEFAULT_CONFIG` +
   `normalizeConfig`; app data → the electron-store schema/defaults and, if you
   split a store, the legacy-seed pattern.
8. **Renderer IPC payloads are untrusted.** Main normalises everything; keep the
   `normalize*` helpers in the path when refactoring.
9. **The Windows click-through path is Windows-only.** `useWindowsClickThrough`
   returns early on other platforms; the 10 Hz region report and the 25 Hz cursor
   poll only run on Windows. Test reasoning there, not on macOS/Linux.
10. **Don't cache the OpenAI key into module scope** in a way that survives
    `save-openai-settings` without invalidation — same rule as the other
    credential caches.

---

## 7. Template for the next pass

```text
1. Read docs/PERFORMANCE.md + docs/OPTIMIZATION_GUIDE.md.
2. npm run build; node scripts/perf-report.mjs --save perf/baseline.json.
3. Pick ONE area from §5. Instrument or reason about the exact work removed.
4. Change only that area. Add/extend a unit test for any pure logic touched.
5. npm run typecheck && npm test && npm run build.
6. Run the integrity checks in §2.
7. node scripts/perf-report.mjs --save perf/final.json
   node scripts/perf-compare.mjs perf/baseline.json perf/final.json
   node --experimental-vm-modules --expose-gc scripts/measure-bundle.cjs out
8. Update docs/PERFORMANCE.md with measured before/after. No estimates.
```

If a change cannot be measured, say so explicitly instead of claiming an
improvement.
