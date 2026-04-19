# Prometheus

A next-generation command bar app for Windows and macOS, inspired by the visual language of Raycast and Claude Desktop.

## Features

- **Frosted Glass UI** — Deep dark translucent window with `backdrop-blur` and subtle border highlights
- **Graceful Animations** — Spring-based open/close animations powered by Framer Motion
- **Global Shortcut** — Press `Alt+Space` (Windows/Linux) or `Option+Space` (macOS) to toggle
- **Mock AI Function Calling** — Type a command and press Enter to see intent detection in action
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
3. Type a command such as:
   - `open documents folder` → detected as **system_command**
   - `search electron react` → detected as **web_search**
   - `open Spotify` → detected as **open_app**
4. Press **Enter** to process (intent is logged to console in this initial phase).
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
