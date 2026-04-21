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

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), copyAssetsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [react()]
  }
})
