# Covenant

[![CI](https://github.com/LunnosMp4/Covenant/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/LunnosMp4/Covenant/actions/workflows/ci.yml)

Floating command bar for Windows and macOS — chat with OpenAI models, run terminal commands, execute saved workflows, capture tasks, launch apps, and browse your clipboard from a single keyboard-driven interface.
<table>
  <tr>
    <td><img width="1930" height="1039" alt="Capture4" src="https://github.com/user-attachments/assets/5f7fcc8d-4ecc-420f-8186-aa4725e57717" /></td>
    <td width="10"></td>
    <td><img width="1600" height="900" alt="Mockup" src="https://github.com/user-attachments/assets/219f9915-b3e1-4e04-be80-a04cb85835ea" /></td>
  </tr>
</table>

## Key Features

- **AI chat** via the OpenAI Responses API (streaming SSE) with selectable models (GPT-6 Luna, GPT-6.1 Sol)
- **Reasoning display** — collapsible panel with shimmer animation, configurable effort (low/medium/high) per model
- **Web search** with source citations and favicons (auto-detected per model capability)
- **Voice input** — push-to-talk transcription (gpt-4o-mini-transcribe) with an animated waveform
- **Conversation history** with auto-generated titles, plus global instructions and reusable instruction templates
- **Context & cost tracking** — per-message token usage and client-side cost breakdown (cached/cache-write aware)
- **Built-in terminal** — multi-session xterm + node-pty, configurable shell and font
- **Workflow runner** — PowerShell, CMD, Python, Node.js, Shell, or a fully custom command
- **App launcher** — fuzzy-searched installed apps, manual launcher entries with file pick and icon extraction, toggleable Windows system apps
- **Tasks** with AI evaluation and gamification — XP, levels, rank titles, streaks, and difficulty tiers
- **Paste Manager** — searchable clipboard history for text/rich text/images/links/files, pinning, link previews, optional OCR, and retention limits
- **MCP integration** — JSON-RPC over HTTP with one-click presets (GitHub, Slack, Brave Search), tool discovery, per-tool toggles, and auth modes
- **Themes** — four gradient presets (two dark, two light) plus custom gradients and a film-grain texture overlay
- **Auto-update** via electron-updater against GitHub Releases, with download progress
- **System tray**, global configurable shortcuts, always-on-top floating window, and first-run onboarding
- Frosted-glass UI with Tailwind CSS and spring animations (Framer Motion)

## Tech Stack

| Layer | Technology |
|---|---|
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
| Updates | electron-updater |

## Setup

### Prerequisites

- Node.js >= 22
- npm >= 9

### Install

```bash
npm install
```

### Development

```bash
npm run dev
```

### Production Build

```bash
npm run build       # outputs to out/
npm run dist        # packages installer via electron-builder
```

### Quality Checks

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest run
```

CI runs typecheck, tests, and a build on Windows, macOS, and Linux.

## Configuration

### API Key

Create a `.env` file at the project root:

```
OPENAI_API_KEY=your_openai_api_key_here
```

The key can also be set through **Settings > General** in the app UI. The API key runs exclusively in the Electron main process via IPC — it is never exposed to the renderer.

### Proxy (optional)

If behind a corporate proxy, set any of these (checked in order):

```
OPENAI_PROXY_URL=http://your-proxy:8080
HTTPS_PROXY=http://your-proxy:8080
HTTP_PROXY=http://your-proxy:8080
```

A proxy URL can also be configured under **Settings > General > Advanced settings**, and applies to both OpenAI requests and MCP server connections.

### Model selection

Choose between GPT-6 Luna and GPT-6.1 Sol under **Settings > General**. Both support reasoning effort and web search. Input/output pricing is tracked client-side for cost estimates.

### Settings

Settings live in a dedicated window with the following tabs: **General** (API key, proxy, startup, updates, chat model, shortcuts), **Appearance** (theme, texture, bar buttons), **Terminal** (shell, font), **App Launcher**, **Workflows**, **Instructions**, **MCP Servers**, **Usage & Cost**, and **Clipboard** (Paste Manager).

## Usage

### Global shortcuts (configurable)

| Shortcut | Action |
|---|---|
| `Alt+Space` | Toggle the command bar open/close |
| `Alt+T` | Open directly in terminal mode |
| `Alt+L` | Open the Tasks quick-capture list |
| `Alt+V` | Open the Paste Manager window |

### In-app shortcuts

| Shortcut | Action |
|---|---|
| `Tab` | Switch between AI chat and terminal mode |
| `Ctrl+Tab` / `Ctrl+\`` | Toggle conversation history |
| `Escape` | Dismiss popups, close the bar, or exit terminal mode |
| `Enter` | Send prompt |
| `Shift+Enter` | Newline in prompt input |

The command bar unifies multiple result kinds — apps, workflows, tasks, commands, and AI actions — behind a single fuzzy-ranked search. Token usage and estimated cost display under each assistant message, calculated client-side with no Admin API key required.

Config (`AppConfig`) is persisted to `userData/config.json`; larger app data (preprompts, apps, workflows, conversations, paste history) is stored via electron-store.
