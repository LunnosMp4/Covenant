#!/usr/bin/env node
/**
 * Measures what V8 actually has to do with the shipped bundles: read, parse and
 * compile the JavaScript that the renderer needs before it can paint, plus the
 * main-process bundle. File size is only a proxy; this runs the real engine.
 *
 * Usage:
 *   node --experimental-vm-modules scripts/measure-parse.mjs <out-dir>
 */
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const outDir = path.resolve(process.argv[2] ?? 'out')
const assetsDir = path.join(outDir, 'renderer', 'assets')

function read(file) {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return null
  }
}

function staticClosure(entryFile) {
  const seen = new Set()
  const queue = [entryFile]
  while (queue.length) {
    const file = queue.shift()
    if (seen.has(file)) continue
    seen.add(file)
    const text = read(file)
    if (!text) continue
    const re = /(?:^|[;\n}])\s*(?:import|export)\s*(?:[^'"()]*?\bfrom\s*)?["'](\.\/[^"']+\.js)["']/g
    let match
    while ((match = re.exec(text))) queue.push(path.join(path.dirname(file), match[1]))
  }
  return [...seen]
}

function compile(files) {
  let bytes = 0
  const started = process.hrtime.bigint()
  for (const file of files) {
    const source = read(file)
    if (source === null) continue
    bytes += Buffer.byteLength(source)
    // Parsing + top-level compilation, exactly what the engine does on load.
    new vm.SourceTextModule(source, { identifier: file })
    // eslint-disable-next-line no-unused-vars
    noop = null
  }
  const ms = Number(process.hrtime.bigint() - started) / 1e6
  return { files: files.length, bytes, ms }
}

let noop = null

const html = read(path.join(outDir, 'renderer', 'index.html')) ?? ''
const entry = /src="\.\/(assets\/[^"]+\.js)"/.exec(html)
const appChunk = fs.existsSync(assetsDir)
  ? fs
      .readdirSync(assetsDir)
      .filter((name) => /^App-[^/]+\.js$/.test(name))
      .map((name) => path.join(assetsDir, name))[0]
  : null

const critical = new Set()
if (entry) for (const file of staticClosure(path.join(outDir, 'renderer', entry[1]))) critical.add(file)
if (appChunk) for (const file of staticClosure(appChunk)) critical.add(file)

const allJs = fs.existsSync(assetsDir)
  ? fs
      .readdirSync(assetsDir)
      .filter((name) => name.endsWith('.js'))
      .map((name) => path.join(assetsDir, name))
  : []

const mainBundle = path.join(outDir, 'main', 'index.js')
const preloadBundle = path.join(outDir, 'preload', 'index.js')

const results = {
  critical: compile([...critical]),
  allRenderer: compile(allJs),
  main: compile([mainBundle]),
  preload: compile([preloadBundle])
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`
for (const [name, result] of Object.entries(results)) {
  console.log(
    `${name.padEnd(14)} ${String(result.files).padStart(4)} files ${kb(result.bytes).padStart(10)}  ${result.ms.toFixed(1).padStart(8)} ms`
  )
}
console.log(JSON.stringify(results))
