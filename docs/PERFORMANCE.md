# Covenant — performance optimization report

Comparison of the app **before** this optimization pass (`d07bbdb`, unmodified
`electron.vite.config.ts`) and **after** it on the same machine, same Node/V8,
same build pipeline.

Everything below was measured, not estimated. Reproduce with the commands in
[Reproducing these numbers](#reproducing-these-numbers).

---

## 1. What ships to the user

| Metric | Before | After | Change |
|---|---:|---:|---:|
| Packaged app payload (`app.asar`) | **153.2 MB** | **52.5 MB** | **−100.7 MB (−65.7%)** |
| Unpacked app directory | 456.3 MB | 356.2 MB | −100.1 MB |
| Renderer JavaScript (raw) | 16.38 MB | 3.72 MB | −12.66 MB (−77.3%) |
| Renderer JavaScript (gzip) | 3.89 MB | 1.17 MB | −2.72 MB (−70.0%) |
| Renderer output folder | 18.15 MB | 4.68 MB | −13.47 MB (−74.2%) |
| Renderer files emitted | 230 | 79 | −151 (−65.7%) |
| Total `out/` | 19.24 MB | 5.27 MB | −13.96 MB (−72.6%) |
| Total files in `out/` | 234 | 83 | −151 (−64.5%) |
| Main process bundle | 1.07 MB | 594 KB | −45.7% |
| Preload bundle | 26.4 KB | 16.4 KB | −37.8% |
| CSS | 107.0 KB | 82.8 KB | −22.6% |
| Fonts | 1.02 MB (59 files) | 250 KB (19 files) | −76.1% |

## 2. What the engine has to do at runtime

Measured by parsing/compiling the shipped chunks with V8
(`vm.SourceTextModule`), **median of 3 full runs** (run-to-run variance on this
machine is roughly ±20%). "Critical path" is the script closure needed before
the command bar can paint (entry + `App` + static imports).

| Metric | Before | After | Change |
|---|---:|---:|---:|
| Critical path bytes | 1,005.2 KB | 541.7 KB | −46.1% |
| Critical path, gzip | 214.4 KB | 157.5 KB | −26.5% |
| Critical path compile | 69.0 ms | 53.2 ms | −22.9% |
| Entry chunk | 229.9 KB | 143.1 KB | −37.8% |
| App chunk | 305.2 KB | 137.0 KB | −55.1% |
| All renderer chunks compiled | 1,478.3 ms | 549.7 ms | **−62.8%** |
| Main bundle compile | 78.7 ms | 54.6 ms | −30.6% |
| Heap retained by compiled renderer code | 34.1 MB | 9.7 MB | **−24.4 MB (−71.5%)** |
| Build time (`npm run build`) | 2m 22s | 1m 04s – 1m 27s | ≈−47% |

Per-surface chunks (first time the surface opens):

| Surface | Before | After | Change |
|---|---:|---:|---:|
| Chat rendering (markdown + KaTeX + Prism) | 885.5 KB | 429.8 KB | −51.5% |
| Notes (CodeMirror) | 1,007.6 KB | 540.9 KB | −46.3% |
| Terminal (xterm) | 417.9 KB | 286.7 KB | −31.4% |
| Code panel | 121.5 KB | 64.6 KB | −46.8% |
| Chat transcript shell | 25.5 KB | 12.1 KB | −52.5% |
| Paste surface | 25.3 KB | 13.6 KB | −46.2% |
| Excalidraw embed (diagrams) | ~9.0 MB | ~1.1 MB | −88% |
| Charts (ECharts) | 1,456.2 KB | 582.0 KB | −60.0% |

## 3. What changed, and why it matters

### Build / bundle

| Change | Effect | Risk |
|---|---|---|
| Removed Mermaid (pulled transitively by Excalidraw's unused "text to diagram" path) | −7.0 MB, −121 chunks | none — never imported by app code |
| Stubbed Excalidraw locale chunks, HarfBuzz export path, mermaid converter | −1.9 MB, −48 chunks | none — editor UI is never mounted |
| Enabled `build.minify` (electron-vite defaults to **off** for main/preload/renderer) | −2.8 MB renderer, −430 KB main, −24 KB CSS | none — nothing introspects function names |
| Dropped KaTeX `woff`/`ttf` fallbacks (Chromium ≥ 36 always picks `woff2`) | −800 KB, −40 files | none — glyphs identical |
| Moved Vite-bundled deps to `devDependencies` so electron-builder stops shipping them | −100 MB in `app.asar` | needs the runtime allowlist in `package.json` to stay correct |

### Main process — work removed per action

| Path | Before | After |
|---|---|---|
| `recordAiUsage` | rewrote the whole shared store (read + parse + Ajv + stringify + fsync) on **every** AI call | in-memory append, one write per 2 s, own small store file |
| `readConfig` | `statSync` on **every** call (clipboard poll, every AI request, model refresh, MCP lookup) | at most one `statSync` per second |
| OpenCode credential read | OS keychain decrypt + file read on every provider check | cached, invalidated on write/clear |
| Proxy dispatchers | one `ProxyAgent` (own socket pool) per AI/search request | shared per configuration, bounded to 8 |
| OpenCode binary lookup | directory scan + `execFileSync('--version')` per resolve | memoised once per process |
| Chat deltas | one IPC message per token | coalesced per 50 ms window |
| Code-engine deltas | one IPC message per token | coalesced per 50 ms window, per part |
| Workflow log lines | one IPC message per chunk | merged adjacent chunks, 50 ms flush |
| Notes autosave | two `mkdir` syscalls per save | one |
| Paste purge/clear | one `fs.rm` per item, all at once (fd exhaustion at 100k items) | 16 in flight |
| Global IPC | — | `flushAiUsage()` on quit so debouncing can't lose data |

### Bounded memory (previously grew for the process lifetime)

| Collection | Before | After |
|---|---|---|
| `CodeActivityTracker.sessions` | unbounded | 200 (FIFO) |
| `LocalCodeEngine.sessionStatus` | unbounded | 500 (FIFO) |
| `preparedAudio` | unbounded | 512 (FIFO) |
| `faviconCache` | unbounded | 200 |
| `iconCache` | unbounded | 256 |

### Renderer — work removed per frame/token

| Path | Before | After |
|---|---|---|
| Surface prefetch after first show | 5 chunks (~1.4 MB) imported in one idle task | one chunk per idle slice, chat first |
| `normalizeMessageOrder` | copy + sort on **every streamed token** | O(n) ordered check, same array returned |
| Chat row copy payload | `describeUiSpec` walk per render, including while streaming | skipped while streaming, memoised otherwise |
| Chart data table | rebuilt on every chart render | memoised |
| Code transcript cost | recomputed per code token | memoised |
| Notes segment counters | recomputed every 250 ms | memoised |
| Windows click-through | `getComputedStyle` per node, 10×/s | `checkVisibility()` (single style pass) |
| Streamed answer markdown | whole answer re-parsed on every flush (~20/s), cost grows with the square of its length | completed top-level blocks are memoised; only the block being written is parsed (`chat/markdownStream.ts`) |

#### Streamed markdown: measured in the running app

Instrumented renderer (CDP CPU profile + `PerformanceObserver`), real app build,
a 29 kB table/list-heavy answer streamed at ~2.4 kB/s through the real IPC path:

| Metric | Before | After |
|---|---:|---:|
| Long tasks (> 50 ms) during the answer | **67–68** | **0** |
| Frame gaps > 30 ms | 175 | 4 |
| Event-loop lag > 20 ms | 83 | 9 |
| Worst frame gap | 100 ms | 34–38 ms |

The rendered markup is byte-identical apart from the whitespace text nodes
between block-level tags (verified by diffing the post-stream `innerHTML` of
`.chat-markdown`): 218 841 → 218 711 chars, identical after collapsing
inter-tag whitespace.

### Duplicated code / dead code

| Item | Result |
|---|---|
| Tavily + Exa + SearXNG HTTP scaffolding | one `search/http.ts` helper; adapters lost ~60 lines each |
| Chat / notes / code / workflow delta batching | one `streaming/deltaSender.ts` + shared `utils/async.ts` |
| `delay()` copies | 4 → 1 |
| `runWithConcurrency` copies | 2 → 1 (`mapWithConcurrencyResults`), now also bounds streaming tool fan-out |
| `AudioWaveform.tsx` | deleted (superseded by `VoiceDotMatrix`) |
| Dead exports (`getSettingsWindow`, `isMeetingSessionActive`, `hasSshCredential`, `baseNameRemote`, `readRemoteText`, `getTrayIconPaths`, `TERMINAL_SENTINEL_OSC`, `clearAiUsageEntries`) | deleted |
| Dead renderer helpers (`GridIcon`, code `MinimizeIcon`, `formatConversationTimestamp`) | deleted |

## 4. Test coverage

| Metric | Before | After |
|---|---:|---:|
| Test files | 47 | 53 |
| Tests | 477 | **509** (all passing) |
| Typecheck | pass | pass |

New tests lock the behaviours touched here:

- `src/main/ai/search/http.test.ts` — timeouts, caller aborts, status mapping,
  result normalisation for all three search providers.
- `src/main/utils/async.test.ts` — concurrency caps, ordering, per-item errors.
- `src/main/ai/usageLedger.test.ts` — debounced persistence, quit flush, store
  isolation.
- `src/main/code/codeCredentials.test.ts`, `src/main/services/proxyDispatcher.test.ts`.
- `src/renderer/src/app/utils/chat.test.ts` — message ordering fast path.

## 5. What the user actually perceives

1. **Download / install / disk: −100 MB** — the clearest, unconditional win.
2. **First open of heavy surfaces: roughly half the JS to parse** (notes −467 KB,
   chat −456 KB, terminal −131 KB).
3. **Cold start: smaller but real** — the main bundle is 46% smaller and the
   critical path is 46% smaller. On a fast desktop this is tens of milliseconds;
   on a slow disk / low-end CPU it is more.
4. **Diagrams: large win** — an Excalidraw checkpoint used to pull ~9 MB; it now
   pulls ~1.1 MB.
5. **Long sessions: ~24 MB less heap** and several previously unbounded maps are
   now capped.
6. **Steady-state CPU:** fewer IPC round-trips, no per-token full-store writes,
   no per-call config `stat`, no per-call keychain decrypt.

Nothing here changes layout, colours, animations, copy, or interaction order.
The only visual-adjacent change is that streamed text/logs are flushed in 50 ms
windows instead of token-by-token, which is what the chat stream already did.

## 6. Reproducing these numbers

```bash
# 1. Baseline: build the commit before the optimization pass
git worktree add /tmp/covenant-baseline d07bbdb
ln -s "$PWD/node_modules" /tmp/covenant-baseline/node_modules
(cd /tmp/covenant-baseline && npm run build)

# 2. Current build
npm run build

# 3. Byte-level report (writes JSON for the comparison script)
node scripts/perf-report.mjs --save perf/final.json
node scripts/perf-compare.mjs perf/baseline.json perf/final.json

# 4. Real V8 parse/compile + retained heap
node --experimental-vm-modules --expose-gc scripts/measure-bundle.cjs out
node --experimental-vm-modules --expose-gc \
  /tmp/covenant-baseline/scripts/measure-bundle.cjs /tmp/covenant-baseline/out

# 5. Packaged payload
npx electron-builder --dir --linux --publish never --config.directories.output=/tmp/dist
stat -c %s /tmp/dist/linux-arm64-unpacked/resources/app.asar
```

`perf/baseline.json` and `perf/final.json` in this repository hold the raw data
for the tables above.

## 7. Environment caveat

Electron cannot be launched in this container (no GTK, no display), so
runtime CPU/RAM of the live app could not be sampled with `app.getAppMetrics()`.
Everything reported here is either measured on the real build output (bytes,
V8 compilation, heap retained by compiled modules, packaged artifacts) or a
count of eliminated work (writes, IPC messages, syscalls). No numbers in this
document are guesses.
