# Covenant

Floating command bar for Windows and macOS — prompt an OpenAI model, run terminal commands, execute workflow scripts, and launch apps from a single keyboard-driven interface.

## Key Features

- AI chat via OpenAI Responses API (streaming SSE) with configurable models (GPT-5.6 Terra, GPT-5.6 Luna, GPT-5.4 Nano, GPT-4o Mini)
- Collapsible reasoning display with shimmer animation during streaming
- Web search with source citations (auto-detected per model capability)
- Voice transcription (gpt-4o-mini-transcribe) with animated mic input
- Built-in terminal (xterm + node-pty) with configurable shell and font
- Workflow script runner (PowerShell, CMD, Python, Node.js, Shell, custom)
- App launcher with file-pick and icon extraction
- MCP server integration with tool discovery and auto-calling
- Conversation history (last 20), system prompts, and preprompt templates
- Per-message token usage and cost breakdown (client-side pricing table)
- Frosted glass UI with Tailwind CSS, spring animations (Framer Motion)
- System tray icon with context menu, always-on-top floating window

## Tech Stack

| Layer | Technology |
|---|---|
| Platform | Electron 41 |
| Frontend | React 18, TypeScript |
| Styling | Tailwind CSS 3 |
| Animations | Framer Motion 11 |
| Build | electron-vite 5 + Vite 7 |
| Terminal | node-pty, xterm, xterm-addon-fit |
| Markdown | react-markdown, remark-gfm, prismjs |
| Storage | electron-store |
| AI SDK | openai (Node.js), undici proxy agent |

## Setup

### Prerequisites

- Node.js >= 18
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

### Model selection

Choose from four models via **Settings > Model**. Each model auto-detects whether it supports reasoning (effort: low/medium/high) and web search.

## Usage

| Shortcut | Action |
|---|---|
| `Alt+Space` | Toggle the command bar open/close |
| `Tab` | Switch between AI chat and terminal mode |
| `Ctrl+Tab` | Toggle conversation history panel |
| `Escape` | Dismiss popups, close bar, or exit terminal mode |
| `Enter` | Send prompt |
| `Shift+Enter` | Newline in prompt input |

Token usage and estimated cost display under each assistant message. Cost is calculated client-side using hardcoded per-model pricing — no Admin API key required.
