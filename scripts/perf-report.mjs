#!/usr/bin/env node
/**
 * Static performance report for the built app.
 *
 * Electron cannot be launched in every environment (no display/GTK), so the
 * reproducible signals we track are the bytes the renderer has to download and
 * parse before it can paint, plus the size of the main/preload bundles.
 *
 * Usage:
 *   node scripts/perf-report.mjs            # human table
 *   node scripts/perf-report.mjs --json     # machine-readable
 *   node scripts/perf-report.mjs --save out.json
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'out')
const assetsDir = path.join(outDir, 'renderer', 'assets')

function readIfExists(file) {
  try {
    return fs.readFileSync(file)
  } catch {
    return null
  }
}

function bytesOf(dir) {
  let total = 0
  let files = 0
  const walk = (current) => {
    let entries = []
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) walk(full)
      else {
        total += fs.statSync(full).size
        files += 1
      }
    }
  }
  walk(dir)
  return { bytes: total, files }
}

/** Follow static (non-dynamic) `import ... from "./x"` edges from an entry file. */
function staticClosure(entryFile) {
  const seen = new Set()
  const queue = [entryFile]
  while (queue.length) {
    const file = queue.shift()
    if (seen.has(file)) continue
    seen.add(file)
    const source = readIfExists(file)
    if (!source) continue
    const text = source.toString('utf8')
    const re = /(?:^|[;\n}])\s*(?:import|export)\s*(?:[^'"()]*?\bfrom\s*)?["'](\.\/[^"']+\.js)["']/g
    let match
    while ((match = re.exec(text))) {
      queue.push(path.join(path.dirname(file), match[1]))
    }
  }
  return seen
}

function sumFiles(files) {
  let raw = 0
  for (const file of files) {
    const data = readIfExists(file)
    if (data) raw += data.length
  }
  return raw
}

function gzipSize(files) {
  const buffers = []
  for (const file of files) {
    const data = readIfExists(file)
    if (data) buffers.push(data)
  }
  return zlib.gzipSync(Buffer.concat(buffers), { level: 9 }).length
}

function collectJs(dir) {
  const result = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.js')) continue
    result.push(path.join(dir, entry.name))
  }
  return result
}

if (!fs.existsSync(assetsDir)) {
  console.error('out/renderer/assets not found — run `npm run build` first.')
  process.exit(1)
}

const html = readIfExists(path.join(outDir, 'renderer', 'index.html'))?.toString('utf8') ?? ''
const entryMatch = html.match(/src="\.\/(assets\/[^"]+\.js)"/)
const cssMatch = html.match(/href="\.\/(assets\/[^"]+\.css)"/)

const entryJs = entryMatch ? path.join(outDir, 'renderer', entryMatch[1]) : null
const entryCss = cssMatch ? path.join(outDir, 'renderer', cssMatch[1]) : null

const allJs = collectJs(assetsDir)
const renderer = bytesOf(path.join(outDir, 'renderer'))
const main = bytesOf(path.join(outDir, 'main'))
const preload = bytesOf(path.join(outDir, 'preload'))

const critical = new Set()
if (entryJs) for (const file of staticClosure(entryJs)) critical.add(file)
if (entryCss) critical.add(entryCss)

// The App root and its static closure are also required before the first paint
// of the command bar; main.tsx loads it with a dynamic import.
const appChunk = allJs.find((file) => /\/App-[^/]+\.js$/.test(file))
const appCritical = appChunk ? staticClosure(appChunk) : new Set()
for (const file of appCritical) critical.add(file)

const fonts = fs
  .readdirSync(assetsDir)
  .filter((name) => /\.(ttf|woff2?|otf)$/.test(name))
  .map((name) => path.join(assetsDir, name))

const fontBytes = { ttf: 0, woff: 0, woff2: 0, otf: 0 }
for (const file of fonts) {
  const ext = path.extname(file).slice(1)
  fontBytes[ext] = (fontBytes[ext] ?? 0) + fs.statSync(file).size
}

const mermaidChunks = allJs.filter((file) => {
  const name = path.basename(file)
  return (
    /Diagram-|^cynefin-|^percentages-|^subset-|^architecture|^cose-bilkent|^layout-|^chunk-IMKFNOWR|^chunk-TICWLB2K|^pica-|^image-blob-reduce/.test(
      name
    )
  )
})

const report = {
  capturedAt: new Date().toISOString(),
  renderer: { ...renderer, js: { bytes: sumFiles(allJs), gzip: gzipSize(allJs) }, assets: allJs.length },
  main: { ...main },
  preload: { ...preload },
  totalOut: bytesOf(outDir),
  critical: {
    files: critical.size,
    bytes: sumFiles([...critical]),
    gzip: gzipSize([...critical]),
    entry: entryJs ? path.basename(entryJs) : null,
    entryBytes: entryJs ? fs.statSync(entryJs).size : 0,
    appChunk: appChunk ? path.basename(appChunk) : null,
    appBytes: appChunk ? fs.statSync(appChunk).size : 0
  },
  css: {
    bytes: entryCss ? fs.statSync(entryCss).size : 0,
    gzip: entryCss ? gzipSize([entryCss]) : 0
  },
  fonts: { count: fonts.length, ...fontBytes, total: Object.values(fontBytes).reduce((a, b) => a + b, 0) },
  mermaid: { chunks: mermaidChunks.length, bytes: sumFiles(mermaidChunks) },
  largestChunks: allJs
    .map((file) => ({ name: path.basename(file), bytes: fs.statSync(file).size }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 12)
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2))
} else {
  const kb = (n) => `${(n / 1024).toFixed(1)} KB`
  console.log('Renderer JS        ', kb(report.renderer.js.bytes), `(${kb(report.renderer.js.gzip)} gzip)`)
  console.log('Renderer total     ', kb(report.renderer.bytes), `in ${report.renderer.files} files`)
  console.log('Critical path      ', kb(report.critical.bytes), `(${kb(report.critical.gzip)} gzip) in ${report.critical.files} files`)
  console.log('  entry chunk      ', report.critical.entry, kb(report.critical.entryBytes))
  console.log('  App chunk        ', report.critical.appChunk, kb(report.critical.appBytes))
  console.log('CSS                ', kb(report.css.bytes), `(${kb(report.css.gzip)} gzip)`)
  console.log('Main bundle        ', kb(report.main.bytes))
  console.log('Preload bundle     ', kb(report.preload.bytes))
  console.log('Out total          ', kb(report.totalOut.bytes), `in ${report.totalOut.files} files`)
  console.log('Fonts              ', kb(report.fonts.total), report.fonts)
  console.log('Mermaid chunks     ', report.mermaid.chunks, kb(report.mermaid.bytes))
  console.log('Largest chunks:')
  for (const chunk of report.largestChunks) console.log('  ', chunk.name.padEnd(42), kb(chunk.bytes))
}

const saveIndex = process.argv.indexOf('--save')
if (saveIndex !== -1 && process.argv[saveIndex + 1]) {
  fs.writeFileSync(path.resolve(process.argv[saveIndex + 1]), JSON.stringify(report, null, 2))
}
