#!/usr/bin/env node
/**
 * Reports the V8 cost of the shipped bundles: parse+compile time (median of
 * several runs) and the memory V8 keeps after compiling them.
 *
 * Usage:
 *   node --experimental-vm-modules --expose-gc scripts/measure-bundle.cjs <out-dir>
 */
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const outDir = path.resolve(process.argv[2] ?? 'out')
const assetsDir = path.join(outDir, 'renderer', 'assets')

const read = (file) => {
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
  ? fs.readdirSync(assetsDir).filter((name) => name.endsWith('.js')).map((name) => path.join(assetsDir, name))
  : []

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function measure(files, runs = 5) {
  const sources = files.map(read).filter((text) => text !== null)
  const bytes = sources.reduce((sum, text) => sum + Buffer.byteLength(text), 0)
  const times = []
  for (let run = 0; run < runs; run += 1) {
    const started = process.hrtime.bigint()
    for (const source of sources) {
      new vm.SourceTextModule(source, { identifier: 'chunk.js' })
    }
    times.push(Number(process.hrtime.bigint() - started) / 1e6)
  }
  return { files: sources.length, bytes, ms: median(times) }
}

const criticalResult = measure([...critical], 7)
const allResult = measure(allJs, 3)
const mainResult = measure([path.join(outDir, 'main', 'index.js')], 7)

// Memory retained by V8 after parsing/compiling every renderer chunk.
global.gc?.()
const before = process.memoryUsage()
const keepAlive = allJs.map((file) => {
  const source = read(file)
  return source === null ? null : new vm.SourceTextModule(source, { identifier: file })
})
global.gc?.()
const after = process.memoryUsage()
const retainedMb = (after.heapUsed - before.heapUsed) / 1024 / 1024

const kb = (n) => `${(n / 1024).toFixed(1)} KB`
console.log(`critical      ${criticalResult.files} files ${kb(criticalResult.bytes).padStart(10)} ${criticalResult.ms.toFixed(1).padStart(7)} ms`)
console.log(`all renderer  ${allResult.files} files ${kb(allResult.bytes).padStart(10)} ${allResult.ms.toFixed(1).padStart(7)} ms`)
console.log(`main          ${mainResult.files} files ${kb(mainResult.bytes).padStart(10)} ${mainResult.ms.toFixed(1).padStart(7)} ms`)
console.log(`retained heap after compiling all renderer chunks: ${retainedMb.toFixed(1)} MB (${keepAlive.filter(Boolean).length} modules)`)
