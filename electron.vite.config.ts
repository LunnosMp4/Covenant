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
    plugins: [externalizeDepsPlugin({ exclude: ['parse5'] }), copyAssetsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [react(), buildSandboxRuntimePlugin()]
  }
})
