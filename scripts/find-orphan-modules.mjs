#!/usr/bin/env node
/**
 * Reports modules whose exports are never imported anywhere else in src/.
 * A cheap dead-code signal: it only looks at default and named exports, and
 * ignores entry points and files that are only referenced by tests.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = path.join(root, 'src')

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, files)
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full)
  }
  return files
}

const files = walk(srcDir)
const fileSet = new Set(files)
const referenced = new Set()

const importRe = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8')
  let match
  while ((match = importRe.exec(text))) {
    const spec = match[1]
    if (!spec) continue
    if (spec.startsWith('.')) {
      const base = path.resolve(path.dirname(file), spec)
      for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) {
        if (fileSet.has(candidate)) referenced.add(candidate)
      }
    }
  }
}

const entryPoints = new Set([
  path.join(srcDir, 'main/index.ts'),
  path.join(srcDir, 'preload/index.ts'),
  path.join(srcDir, 'renderer/src/main.tsx')
])

/**
 * Modules that are intentionally not imported from TypeScript:
 * - sandbox/* are esbuild entry points declared in electron.vite.config.ts
 * - shims/* are aliased by the Vite config (build-time only)
 * - *.d.ts are ambient declarations
 */
const expectedOrphans = [
  'src/renderer/src/ui/surface/sandbox/',
  'src/renderer/shims/',
  'src/renderer/src/types/api.d.ts',
  'src/renderer/src/types/env.d.ts',
  'src/renderer/src/types/xterm-css.d.ts'
]

const isExpected = (relative) => expectedOrphans.some((prefix) =>
  prefix.endsWith('.d.ts') ? relative === prefix : relative.startsWith(prefix)
)

const orphans = []
for (const file of files) {
  if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) continue
  if (entryPoints.has(file)) continue
  const isReferenced = referenced.has(file)
  const text = fs.readFileSync(file, 'utf8')
  const exportsCount = (text.match(/^export\s+(?:default\s+)?(?:async\s+)?(?:function|const|class|let|type|interface|enum)/gm) ?? []).length
  // A file nobody imports can only be a side-effect module or dead code.
  const relative = path.relative(root, file)
  if (!isReferenced && !isExpected(relative)) {
    orphans.push({ file: relative, exports: exportsCount, lines: text.split('\n').length })
  }
}

orphans.sort((a, b) => b.lines - a.lines)
console.log(`${orphans.length} unreferenced modules:\n`)
for (const orphan of orphans) {
  console.log(`  ${String(orphan.lines).padStart(5)} lines  ${String(orphan.exports).padStart(3)} exports  ${orphan.file}`)
}
