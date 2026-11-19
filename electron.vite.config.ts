import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import fs from 'fs'
import type { Plugin } from 'vite'
import { FRAME_FILE, buildFrameDocument } from './src/shared/ui/frame'

// Custom plugin to copy assets from src/main/assets to out/main/assets
const copyAssetsPlugin = (): Plugin => ({
  name: 'copy-assets',
  apply: 'build',
  writeBundle() {
    const srcPath = resolve(__dirname, 'src/main/assets')
    const destPath = resolve(__dirname, 'out/main/assets')

    if (fs.existsSync(srcPath)) {
      if (!fs.existsSync(destPath)) {
        fs.mkdirSync(destPath, { recursive: true })
      }

      const files = fs.readdirSync(srcPath)
      files.forEach((file) => {
        const srcFile = resolve(srcPath, file)
        const destFile = resolve(destPath, file)
        fs.copyFileSync(srcFile, destFile)
      })
    }
  }
})

/**
 * KaTeX ships the same 20 fonts as woff2 + woff + ttf. This app only runs on
 * Electron's Chromium (>= 120), where woff2 has been supported since Chrome 36,
 * so the woff/ttf fallbacks are dead weight: they add ~800 KB of assets that can
 * never be requested. Drop those `src` entries at build time — the woff2 URL
 * stays first, so the rendered glyphs are byte-for-byte identical.
 */
const dropLegacyFontFormatsPlugin = (): Plugin => ({
  name: 'covenant-drop-legacy-font-formats',
  enforce: 'pre',
  transform(code, id) {
    if (!id.endsWith('.css') || !code.includes('.woff') || !code.includes('format("woff")')) {
      return null
    }
    return code.replace(
      /src:url\(([^)]+\.woff2)\)\s*format\("woff2"\),url\([^)]+\.woff\)\s*format\("woff"\),url\([^)]+\.ttf\)\s*format\("truetype"\)/g,
      'src:url($1) format("woff2")'
    )
  }
})

/**
 * Removes Excalidraw code paths Covenant can never reach.
 *
 * The app never mounts the editor — `ExcalidrawEmbed` only converts a checkpoint
 * into scene JSON for excalidraw.com. Everything below is loaded exclusively by
 * the editor's own UI (language menu, PNG/SVG export), so it is dead weight:
 *
 *   - `locales/*.js`       ~50 translation chunks (~1.1 MB)
 *   - `subset-shared` and `subset-worker` pull a 1.8 MB HarfBuzz wasm build
 *     that only runs when exporting a scene to an image
 *   - `@excalidraw/mermaid-to-excalidraw` drags in the whole of Mermaid (~7 MB)
 *
 * Stubs keep the import graph valid; nothing here is called at runtime.
 */
const EXCALIDRAW_LOCALE_STUB = '\0covenant-excalidraw-locale'
const EXCALIDRAW_SUBSET_STUB = '\0covenant-excalidraw-subset'
const EXCALIDRAW_SUBSET_WORKER_STUB = '\0covenant-excalidraw-subset-worker'
const EXCALIDRAW_MERMAID_STUB = resolve(__dirname, 'src/renderer/shims/excalidrawMermaid.ts')

const dropExcalidrawDeadPathsPlugin = (): Plugin => ({
  name: 'covenant-drop-excalidraw-dead-paths',
  enforce: 'pre',
  resolveId(source, importer) {
    if (source.endsWith('@excalidraw/mermaid-to-excalidraw')) return EXCALIDRAW_MERMAID_STUB
    if (!importer?.includes('@excalidraw/excalidraw/dist/')) return null
    if (/\/locales\/[^/]+\.js$/.test(source)) return EXCALIDRAW_LOCALE_STUB
    if (/\/subset-shared\.chunk\.js$/.test(source)) return EXCALIDRAW_SUBSET_STUB
    if (/\/subset-worker\.chunk\.js$/.test(source)) return EXCALIDRAW_SUBSET_WORKER_STUB
    return null
  },
  load(id) {
    if (id === EXCALIDRAW_LOCALE_STUB) return 'export default {}'
    if (id === EXCALIDRAW_SUBSET_STUB) {
      const fail = (): never => {
        throw new Error('Excalidraw image export is not bundled with Covenant.')
      }
      return `export const Commands = {}; export const subsetToBase64 = ${fail}; export const subsetToBinary = ${fail}; export const toBase64 = ${fail};`
    }
    if (id === EXCALIDRAW_SUBSET_WORKER_STUB) return 'export const WorkerUrl = undefined'
    return null
  }
})

/**
 * The generated-UI sandbox runtime and its chart module are authored in
 * TypeScript but must reach the frame as plain scripts. Bundling them with
 * esbuild into the renderer's public directory keeps dev and packaged builds
 * identical, and keeps ECharts out of both the app bundle and the sandbox
 * bootstrap.
 */
const buildSandboxRuntimePlugin = (): Plugin => {
  let built = false

  return {
    name: 'covenant-sandbox-runtime',
    async buildStart() {
      if (built) return
      built = true

      const outdir = resolve(__dirname, 'src/renderer/public/sandbox')
      const esbuild = await import('esbuild')
      await esbuild.build({
        entryPoints: {
          runtime: resolve(__dirname, 'src/renderer/src/ui/surface/sandbox/runtime.ts'),
          charts: resolve(__dirname, 'src/renderer/src/ui/surface/sandbox/charts.ts')
        },
        outdir,
        bundle: true,
        format: 'iife',
        platform: 'browser',
        target: ['chrome120'],
        minify: true,
        legalComments: 'none',
        logLevel: 'silent'
      })

      // A real URL, not a blob: blob documents inherit the app's CSP, which
      // blocks the frame outright. The runtime is inlined into the document so
      // the frame never loads a `file:` subresource (blocked in packaged builds).
      const runtime = fs.readFileSync(resolve(outdir, 'runtime.js'), 'utf8')
      fs.writeFileSync(resolve(outdir, FRAME_FILE), buildFrameDocument(runtime), 'utf8')
      fs.rmSync(resolve(outdir, 'runtime.js'), { force: true })
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['parse5'] }), copyAssetsPlugin()],
    // electron-vite defaults `build.minify` to false for every target. The
    // shipped bundles were therefore emitted with full indentation and
    // comments: ~40% more bytes to read from disk and parse on startup for no
    // benefit (nothing here is introspected by function name).
    build: { minify: 'esbuild' }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { minify: 'esbuild' }
  },
  renderer: {
    plugins: [
      dropLegacyFontFormatsPlugin(),
      dropExcalidrawDeadPathsPlugin(),
      react(),
      buildSandboxRuntimePlugin()
    ],
    resolve: {
      alias: {
        // Mermaid is only reachable through Excalidraw's unused Mermaid-to-
        // Excalidraw re-export; see src/renderer/shims/mermaid.ts.
        mermaid: resolve(__dirname, 'src/renderer/shims/mermaid.ts')
      }
    },
    build: { minify: 'esbuild' }
  }
})
