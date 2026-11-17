import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import fs from 'fs'
import type { Plugin } from 'vite'

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

      const esbuild = await import('esbuild')
      await esbuild.build({
        entryPoints: {
          runtime: resolve(__dirname, 'src/renderer/src/ui/surface/sandbox/runtime.ts'),
          charts: resolve(__dirname, 'src/renderer/src/ui/surface/sandbox/charts.ts')
        },
        outdir: resolve(__dirname, 'src/renderer/public/sandbox'),
        bundle: true,
        format: 'iife',
        platform: 'browser',
        target: ['chrome120'],
        minify: true,
        legalComments: 'none',
        logLevel: 'silent'
      })
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
