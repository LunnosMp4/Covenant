#!/usr/bin/env node
/**
 * Measures the wall time and RSS delta of requiring a set of native/CJS
 * dependencies the main process loads at startup. Run with:
 *   node scripts/measure-requires.mjs
 */
import { spawnSync } from 'node:child_process'

const modules = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['ssh2', 'node-pty', 'openai', 'electron-store', 'undici', 'electron-updater', 'dotenv', 'parse5']

const script = `
const before = process.memoryUsage()
const start = process.hrtime.bigint()
const results = []
for (const name of ${JSON.stringify(modules)}) {
  const t = process.hrtime.bigint()
  const rss = process.memoryUsage().rss
  try {
    require(name)
    results.push({ name, ms: Number(process.hrtime.bigint() - t) / 1e6, rss: process.memoryUsage().rss - rss, ok: true })
  } catch (e) {
    results.push({ name, ms: Number(process.hrtime.bigint() - t) / 1e6, rss: process.memoryUsage().rss - rss, ok: false, error: String(e.message).slice(0, 60) })
  }
}
const totalMs = Number(process.hrtime.bigint() - start) / 1e6
for (const r of results) {
  console.log(\`\${r.name.padEnd(18)} \${r.ms.toFixed(1).padStart(8)} ms  \${(r.rss / 1024 / 1024).toFixed(1).padStart(7)} MB\${r.ok ? '' : '  (failed: ' + r.error + ')'}\`)
}
console.log(\`total \${totalMs.toFixed(1)} ms, rss \${((process.memoryUsage().rss - before.rss) / 1024 / 1024).toFixed(1)} MB\`)
`

const result = spawnSync(process.execPath, ['--expose-gc', '-e', script], {
  cwd: process.cwd(),
  encoding: 'utf8',
  env: process.env
})
process.stdout.write(result.stdout)
process.stderr.write(result.stderr)
