# Covenant

A next-generation command bar app for Windows and macOS, inspired by the visual language of Raycast and Claude Desktop.

## Features

- **Frosted Glass UI** — Deep dark translucent window with `backdrop-blur` and subtle border highlights
- **Graceful Animations** — Spring-based open/close animations powered by Framer Motion
- **Global Shortcut** — Press `Alt+Space` (Windows/Linux) or `Option+Space` (macOS) to toggle
- **OpenAI Chat Integration** — Prompt the assistant directly from the command bar
- **Cross-Platform Translucency** — Vibrancy (macOS `ultra-dark`) and Acrylic/Mica (Windows)

## Tech Stack

| Layer | Technology |
|---|---|
| Platform | Electron 41 |
| Frontend | React 18 + TypeScript |
| Styling | TailwindCSS 3 |
| Animations | Framer Motion 11 |
| Build | electron-vite 5 + Vite 8 |

## Getting Started

### Prerequisites

- Node.js ≥ 18
- npm ≥ 9

### Install

```bash
npm install
```

### Configure OpenAI API Key

Create a `.env` file at the **repository root**:

`<repository-root>/.env`

Add this variable:

```bash
OPENAI_API_KEY=your_openai_api_key_here
```

If you are behind a corporate proxy, you can optionally add:

```bash
OPENAI_PROXY_URL=http://10.31.255.65:8080
```

Covenant checks proxy variables in this order: `OPENAI_PROXY_URL`, `HTTPS_PROXY`, then `HTTP_PROXY`.

> This project uses `OPENAI_API_KEY` (not `VITE_OPENAI_API_KEY`) because OpenAI calls run in the Electron **main process** via IPC, so the key is not exposed to the renderer bundle.

### Development

```bash
npm run dev
```

This starts the app in development mode with hot-module replacement.

### Build

```bash
npm run build
```

Outputs bundled files to `out/`.

## Usage

1. Launch the app — the window is hidden on startup.
2. Press **Alt+Space** (or **Option+Space** on macOS) to open the command bar.
3. Type a prompt for Covenant.
4. Press **Enter** to send it to OpenAI (`gpt-5.4-nano`).
5. Press **Escape** or click outside to close with a graceful exit animation.

## Project Structure

```
src/
├── main/
│   └── index.ts        # Electron main process (window, shortcuts, IPC)
├── preload/
│   └── index.ts        # Context bridge (exposes electronAPI to renderer)
└── renderer/
    ├── index.html
    └── src/
        ├── main.tsx    # React entry point
        ├── App.tsx     # Main command bar component
        └── assets/
            └── index.css   # TailwindCSS entry
```
