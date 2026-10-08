# Covenant

**A keyboard-first command bar for Windows and macOS.** Chat with AI, run terminal
commands, drive a coding agent, execute saved workflows, capture tasks, launch apps, and
search your clipboard history — from a single floating window summoned with one keystroke.

[![CI](https://github.com/LunnosMp4/Covenant/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/LunnosMp4/Covenant/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/LunnosMp4/Covenant?display_name=tag)](https://github.com/LunnosMp4/Covenant/releases/latest)
[![License: MIT](https://img.shields.io/github/license/LunnosMp4/Covenant)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-blue)](https://github.com/LunnosMp4/Covenant/releases/latest)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](package.json)

<table>
  <tr>
    <td><img width="1930" height="1039" alt="Covenant command bar" src="https://github.com/user-attachments/assets/5f7fcc8d-4ecc-420f-8186-aa4725e57717" /></td>
    <td width="10"></td>
    <td><img width="1600" height="900" alt="Covenant overview" src="https://github.com/user-attachments/assets/219f9915-b3e1-4e04-be80-a04cb85835ea" /></td>
  </tr>
</table>

## Why Covenant

Most of the workday is spent moving between tools: a browser for a quick question, a
terminal for a build, a launcher to find an app, a notes file for the task you just
remembered. Each hop costs a little focus, and it adds up.

Covenant removes the hopping. It runs quietly in the system tray and appears over whatever
you are doing when you press `Alt+Space`. One input unifies the things you reach for all
day — AI chat, a terminal, a coding agent, saved workflows, your clipboard, and your apps —
behind a single fuzzy-ranked search.

- **One keystroke away.** A frameless, always-on-top window that opens over any application
  and closes the moment you are done.
- **One input, many results.** Apps, workflows, tasks, terminal commands, and AI actions are
  ranked together as you type.
- **Local by default.** The interface never touches your API keys; they stay in the main
  process. Your history, clipboard, and settings live on your machine.

### Who it is for

Covenant is built for people who live on the keyboard — developers, DevOps and sysadmins,
and power users who want their AI assistant, terminal, launcher, and clipboard in one place
instead of scattered across a dozen windows.

## Download

Covenant ships as a native installer for Windows and macOS and updates itself in the
background.

[![Download for Windows](https://img.shields.io/badge/Download-Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/LunnosMp4/Covenant/releases/latest)
[![Download for macOS](https://img.shields.io/badge/Download-macOS-000000?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/LunnosMp4/Covenant/releases/latest)

| Platform | Installer |
| --- | --- |
| Windows 10/11 (x64) | `Covenant-<version>-win-x64.exe` (NSIS installer) |
| macOS (Apple Silicon) | `Covenant-<version>-mac-arm64.dmg` |

Download links always point to the [latest release](https://github.com/LunnosMp4/Covenant/releases/latest).
The macOS build is signed for Apple Silicon; Intel Macs are not currently packaged.

**First run.** Open **Settings → General** and add your OpenAI API key to enable AI chat. To
use the coding agent (Covenant Code), also add an [OpenCode Go](https://opencode.ai) API
key under **Settings → Code** — the runtime itself is bundled, so there is nothing extra to
install.

## Highlights

### Command bar and search
- Frameless, always-on-top window with a frosted-glass UI and spring animations.
- A single fuzzy-ranked input across apps, workflows, tasks, terminal commands, and AI
  actions.
- Global, fully remappable shortcuts, plus first-run onboarding and a system tray menu.

### AI assistant
- Chat with OpenAI models over the Responses API with streaming responses.
- A collapsible **reasoning** panel with configurable effort (low, medium, high) per model.
- **Web search** with source citations and favicons, detected automatically per model.
- **Voice input** — push-to-talk transcription with an animated waveform.
- **Conversation history** with auto-generated titles, plus global instructions and reusable
  instruction templates ("preprompts").
- **Context and cost tracking** — per-message token usage and a client-side cost breakdown
  (cache-aware), with no Admin API key required.
- Image attachments and rendered Markdown, code, and math.

### Covenant Code
An integrated coding agent powered by a **bundled OpenCode runtime** — no separate install.
- **Projects and sessions** with history, titles, and per-session model selection.
- **Choose a machine:** run locally, or connect to a remote host over **SSH** (password, key,
  or agent auth, with TOFU host-key pinning and secrets kept in the OS keychain).
- **Permission gates** for file edits, shell commands, external directories, and web fetch.
- **Live agent activity** — streaming text and reasoning, tool calls, shell output, and file
  edits as they happen.
- **Diff view** of every file the agent changes, and **interactive forms** for structured
  questions.
- **Background runs** with desktop notifications when a session finishes or needs your input.

### Terminal and workflows
- **Built-in terminal** — multi-session `xterm` backed by `node-pty`, with configurable shell
  and font.
- **Workflow runner** — save and run reused scripts in PowerShell, CMD, Python, Node.js, or
  Shell, or a fully custom command, with live logs.

### Clipboard history
- A searchable **Paste Manager** window (`Alt+V`) for text, rich text, images, links, and
  files.
- Pinning, link previews, optional **OCR** for images, and configurable retention limits.

### App launcher
- Fuzzy search across installed applications, warmed in the background for instant results.
- Manual launcher entries with file picking and icon extraction, plus optional Windows system
  apps.

### Tasks and progress
- Capture tasks and let the assistant evaluate difficulty, estimate effort, and categorize
  them.
- **Gamification** — XP, levels, rank titles, streaks, and difficulty tiers that turn a task
  list into forward momentum.

### Extensibility
- **MCP servers** over JSON-RPC/HTTP with one-click presets (GitHub, Slack, Brave Search),
  tool discovery, per-tool toggles, and configurable auth.
- An embedded **Excalidraw** bridge for generating and reading diagrams as part of a chat.

### Personalization
- Four gradient theme presets (two dark, two light), custom gradients, and an optional
  film-grain texture overlay.
- Toggleable command-bar buttons, a system tray menu, launch-on-startup, and auto-update.

## Quick start

### Install (end users)

1. Download the installer for your platform from the [latest release](https://github.com/LunnosMp4/Covenant/releases/latest).
2. Run it and launch Covenant. It starts in the system tray.
3. Open **Settings → General**, add your OpenAI API key, and (optionally) add an OpenCode Go
   key under **Settings → Code**.
4. Press `Alt+Space` to summon the command bar.

Covenant keeps itself up to date from GitHub Releases; you can control this under
**Settings → General**.

### Run from source (developers)

Requires **Node.js >= 22** and **npm >= 9**.

```bash
git clone https://github.com/LunnosMp4/Covenant.git
cd Covenant
npm install
npm run dev
```

To build and package a local installer:

```bash
npm run build   # compile main, preload, and renderer into out/
npm run dist    # package an installer with electron-builder
```

## Using Covenant

### Global shortcuts (configurable)

| Shortcut | Action |
| --- | --- |
| `Alt+Space` | Toggle the command bar open or closed |
| `Ctrl+Alt+Space` | Reopen the most recent conversation |
| `Alt+T` | Open directly in terminal mode |
| `Alt+L` | Open the Tasks quick-capture list |
| `Alt+V` | Open the Paste Manager window |
| `Alt+C` | Open the Covenant Code surface |
| `Alt+M` | Toggle Code mode in the command bar |

Every shortcut can be remapped in **Settings → General**.

### In-app shortcuts

| Shortcut | Action |
| --- | --- |
| `Tab` | Switch between AI chat and terminal mode |
| `Ctrl+Tab` / `Ctrl+\`` | Toggle conversation history |
| `Escape` | Dismiss popups, close the bar, or exit terminal mode |
| `Enter` | Send the prompt |
| `Shift+Enter` | Insert a newline in the prompt |

## Configuration

### API key

Create a `.env` file at the project root when running from source:

```
OPENAI_API_KEY=your_openai_api_key_here
```

You can also set the key in **Settings → General**. The key is used exclusively in the
Electron main process and is never exposed to the renderer.

### Proxy (optional)

When running behind a corporate proxy, set any of the following (checked in order):

```
OPENAI_PROXY_URL=http://your-proxy:8080
HTTPS_PROXY=http://your-proxy:8080
HTTP_PROXY=http://your-proxy:8080
```

A proxy URL can also be set under **Settings → General → Advanced settings**; it applies to
both OpenAI requests and MCP server connections.

### Models

Choose between **GPT-6 Luna** and **GPT-6.1 Sol** under **Settings → General**. Both support
reasoning effort and web search. Input and output pricing are tracked client-side to estimate
cost — no Admin API key is needed.

### Settings

Settings live in a dedicated window and are grouped into the following tabs:

| Tab | Controls |
| --- | --- |
| General | API key, proxy, startup, updates, chat model, global shortcuts |
| Appearance | Theme gradient, texture, command-bar buttons |
| Terminal | Default shell and font |
| Code | OpenCode runtime, remote machines, models, permissions |
| App Launcher | Manual entries and system-app visibility |
| Workflows | Saved scripts and languages |
| Instructions | Global instructions and reusable templates |
| MCP Servers | Server connections, tools, and authentication |
| Usage & Cost | Token usage and cost breakdown |
| Clipboard | Paste Manager settings and retention |

## Architecture

Covenant is a standard Electron split across three processes, with all shared types and
domain logic isolated so they can be reused and unit tested.

- `src/main/` — the Node side. A thin `index.ts` bootstrap plus one IPC module per domain
  (`ipc/`), window and tray state (`windows/`), the OpenAI client (`openai/`), and feature
  modules (`features/`, `services/`, `mcp/`, `code/`, `paste/`).
- `src/preload/` — the `contextBridge` that exposes a typed `window.api` to the renderer.
- `src/renderer/src/` — the React UI: the command bar (`App.tsx`), plus `chat/`, `terminal/`,
  `launcher/`, `workflow/`, `tasks/`, `paste/`, `code/`, and `settings/`.
- `src/shared/` — framework-agnostic types, defaults, and normalizers shared by all
  processes, grouped by domain.

Runtime config (`AppConfig`) is persisted to `userData/config.json`. Larger app data —
instructions, launcher entries, workflows, conversations, and clipboard history — is stored
via `electron-store`. Secrets (such as SSH credentials) are kept in the OS keychain through
Electron's `safeStorage`.

## Tech stack

| Layer | Technology |
| --- | --- |
| Platform | Electron 41 |
| Frontend | React 18, TypeScript |
| Styling | Tailwind CSS 3 |
| Animations | Framer Motion 11 |
| Build | electron-vite 5 + Vite 7 |
| Testing | Vitest 4, Testing Library |
| Terminal | node-pty, xterm, xterm-addon-fit |
| Markdown | react-markdown, remark-gfm, remark-math, rehype-katex, prismjs |
| Storage | electron-store |
| AI SDK | openai (Node.js), undici, https-proxy-agent |
| Coding agent | OpenCode (bundled runtime) |
| Remote | ssh2, SFTP |
| Updates | electron-updater |

## Development

```bash
npm run dev         # run with HMR
npm run build       # compile to out/
npm start           # run the compiled app (requires a prior build)
npm run dist        # package an installer
npm run typecheck   # tsc --noEmit
npm test            # vitest run
npm run test:watch  # vitest in watch mode
```

CI runs typecheck, tests, and a build on Windows, macOS, and Linux
(`.github/workflows/ci.yml`).

## Contributing

Contributions are welcome. Bug reports and feature requests are best filed as
[GitHub issues](https://github.com/LunnosMp4/Covenant/issues); code changes can be proposed
as pull requests.

- Keep commits in the [Conventional Commits](https://www.conventionalcommits.org) style
  (`feat:`, `fix:`, `chore:`, `refactor:`).
- Run `npm run typecheck` and `npm test` before opening a pull request.
- Match the structure, naming, and patterns of the surrounding code.

## License

Released under the [MIT License](LICENSE).

## Credits

Covenant is built and maintained by [LunnosMp4](https://github.com/LunnosMp4). It bundles the
[OpenCode](https://opencode.ai) runtime to power Covenant Code, and relies on the OpenAI,
Electron, React, and Tailwind projects listed above.
