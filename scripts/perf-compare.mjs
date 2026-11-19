#!/usr/bin/env node
/**
 * Prints the before/after table for the optimisation pass.
 *
 * Usage:
 *   node scripts/perf-compare.mjs perf/baseline.json perf/after.json
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const [, , baselineArg = 'perf/baseline.json', afterArg = 'perf/final.json'] = process.argv

function read(file) {
  const resolved = path.isAbsolute(file) ? file : path.join(root, file)
  return JSON.parse(fs.readFileSync(resolved, 'utf8'))
}

const baseline = read(baselineArg)
const after = read(afterArg)

const rows = [
  ['Renderer JS (raw)', baseline.renderer.js.bytes, after.renderer.js.bytes],
  ['Renderer JS (gzip)', baseline.renderer.js.gzip, after.renderer.js.gzip],
  ['Renderer total', baseline.renderer.bytes, after.renderer.bytes],
  ['Renderer files', baseline.renderer.files, after.renderer.files, true],
  ['Critical path (raw)', baseline.critical.bytes, after.critical.bytes],
  ['Critical path (gzip)', baseline.critical.gzip, after.critical.gzip],
  ['Entry chunk', baseline.critical.entryBytes, after.critical.entryBytes],
  ['App chunk', baseline.critical.appBytes, after.critical.appBytes],
  ['CSS', baseline.css.bytes, after.css.bytes],
  ['Fonts', baseline.fonts.total, after.fonts.total],
  ['Main bundle', baseline.main.bytes, after.main.bytes],
  ['Preload bundle', baseline.preload.bytes, after.preload.bytes],
  ['Total out', baseline.totalOut.bytes, after.totalOut.bytes],
  ['Out files', baseline.totalOut.files, after.totalOut.files, true]
]

function format(value, isCount) {
  if (isCount) return String(value)
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)} MB`
  return `${(value / 1024).toFixed(1)} KB`
}

function delta(before, now, isCount) {
  const diff = now - before
  const pct = before === 0 ? 0 : (diff / before) * 100
  const sign = diff > 0 ? '+' : ''
  return `${sign}${format(Math.abs(diff), isCount).replace(/^/, diff < 0 ? '-' : '')} (${sign}${pct.toFixed(1)}%)`
}

const header = '| Metric | Before | After | Change |'
const divider = '| --- | ---: | ---: | ---: |'
const lines = [header, divider]
for (const [label, before, now, isCount = false] of rows) {
  lines.push(`| ${label} | ${format(before, isCount)} | ${format(now, isCount)} | ${delta(before, now, isCount)} |`)
}

console.log(lines.join('\n'))
