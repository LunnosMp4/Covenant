#!/usr/bin/env node
// Generates the GitHub Release body for Covenant.
//
// Compares the commits of the release being published with the previous
// published GitHub release, then asks OpenAI (Responses API) for English
// release notes. Runs in the `prepare` job of
// .github/workflows/release.yml and writes `release-notes.md`, which is passed
// to the release step via `body_path`.
//
// Required environment:
//   RELEASE_TAG        tag being released (e.g. v1.13.0); derived from
//                      package.json when missing
//   OPENAI_API_KEY     repository secret holding an OpenAI API key
// Optional environment:
//   GITHUB_REPOSITORY  owner/repo (provided by Actions), used to find the
//                      previous release through the GitHub API
//   GITHUB_TOKEN       token used for that lookup; falls back to git tags
//
// Design rule: this script must never fail the release. Every failure path
// (no key, HTTP error, timeout, empty answer) falls back to a raw commit list
// and exits with code 0.

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const OUTPUT_FILE = resolve(process.cwd(), 'release-notes.md')
const OPENAI_URL = 'https://api.openai.com/v1/responses'
const MODEL = 'gpt-6-luna'
const MAX_COMMITS = 200
const MAX_COMMIT_CHARS = 60_000
const REQUEST_TIMEOUT_MS = 90_000

function git(args, { optional = false, inherit = false } = {}) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      stdio: inherit ? 'ignore' : undefined
    }).trim()
  } catch (error) {
    if (optional) return ''
    throw error
  }
}

function resolveTag() {
  const fromEnv = (process.env.RELEASE_TAG ?? '').trim()
  if (fromEnv) return fromEnv

  try {
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'))
    if (typeof pkg.version === 'string' && pkg.version.trim()) {
      return `v${pkg.version.trim()}`
    }
  } catch {
    // handled below
  }

  throw new Error('RELEASE_TAG is not set and package.json has no version')
}

function tagExists(tag) {
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', `refs/tags/${tag}`], {
      stdio: 'ignore'
    })
    return true
  } catch {
    return false
  }
}

/**
 * Finds the most recent published release that is not the one being created.
 * Uses the GitHub API first (drafts/prereleases excluded), then local tags.
 */
async function findPreviousRelease(repo, currentTag) {
  const token = (process.env.GITHUB_TOKEN ?? '').trim()

  if (repo && token) {
    try {
      const response = await fetch(
        `https://api.github.com/repos/${repo}/releases?per_page=100`,
        {
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token}`,
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'covenant-release-notes'
          },
          signal: AbortSignal.timeout(20_000)
        }
      )

      if (response.ok) {
        const releases = await response.json()
        if (Array.isArray(releases)) {
          const previous = releases.find(
            (release) =>
              release &&
              !release.draft &&
              !release.prerelease &&
              typeof release.tag_name === 'string' &&
              release.tag_name &&
              release.tag_name !== currentTag
          )
          if (previous?.tag_name) return previous.tag_name
        }
      } else {
        console.warn(`[release-notes] GitHub API returned ${response.status} while listing releases`)
      }
    } catch (error) {
      console.warn(`[release-notes] Could not list releases through the GitHub API: ${error.message}`)
    }
  }

  const tags = git(['tag', '--sort=-v:refname'], { optional: true })
    .split('\n')
    .map((tag) => tag.trim())
    .filter(Boolean)
  return tags.find((tag) => tag !== currentTag) ?? null
}

/** Returns the previous tag only if it can be used as a git range. */
function ensureLocalTag(tag) {
  if (!tag) return null
  if (tagExists(tag)) return tag

  console.warn(`[release-notes] Tag ${tag} is not available locally, fetching tags...`)
  git(['fetch', '--tags', '--quiet', 'origin'], { optional: true, inherit: true })
  if (tagExists(tag)) return tag

  console.warn(`[release-notes] Tag ${tag} is still missing; releasing without a baseline`)
  return null
}

function cleanBody(body) {
  const line = body
    .split('\n')
    .map((entry) => entry.trim())
    .find(
      (entry) =>
        entry.length > 0 &&
        !/^(co-authored-by|signed-off-by|reviewed-by|refs?:|see:)/i.test(entry)
    )
  if (!line) return ''
  return line.length > 180 ? `${line.slice(0, 177)}...` : line
}

/** Collects commit subjects (and a short body hint) for the release range. */
function collectChanges(previousTag) {
  const range = previousTag ? [`${previousTag}..HEAD`] : []
  const limit = `-n${MAX_COMMITS}`

  const rawLog = git(
    ['log', '--no-merges', limit, '--pretty=format:%h%x1f%s%x1f%b%x1e', ...range],
    { optional: true }
  )

  const subjects = []
  const lines = []
  let chars = 0

  for (const record of rawLog.split('\x1e')) {
    const entry = record.replace(/^\s+/, '')
    if (!entry) continue

    const [hash, subject, body = ''] = entry.split('\x1f')
    const cleanSubject = (subject ?? '').trim()
    if (!cleanSubject) continue
    // Skip pure version-bump noise; the release name already carries the version.
    if (/^chore: bump version|^chore: update version/i.test(cleanSubject)) continue

    subjects.push(cleanSubject)
    const hint = cleanBody(body)
    const line = `- ${hash} ${cleanSubject}${hint ? ` (${hint})` : ''}`
    if (chars + line.length > MAX_COMMIT_CHARS) break
    chars += line.length + 1
    lines.push(line)
  }

  const diffStat = git(['diff', '--shortstat', ...(previousTag ? [previousTag, 'HEAD'] : [])], {
    optional: true
  })

  return { subjects, commitList: lines.join('\n'), diffStat }
}

function instructionsFor(tag, previousTag) {
  return `You write release notes for Covenant, a desktop command bar app for Windows and macOS.

You receive the git commits of the release ${tag}${
    previousTag ? ` since the previous release ${previousTag}` : ''
  }. Turn them into release notes.

Rules:
- Write in English only.
- Output GitHub-flavored Markdown. No title, no preamble, no closing remark.
- Use these headings, in this order, and omit any section that has nothing worth mentioning:
  ### New features
  ### Improvements
  ### Bug fixes
  ### Under the hood
- Before the headings, you may add one short sentence (max 25 words) that summarises the release. Skip it if the change is minor.
- Each bullet is a single short sentence (max 20 words) about the user-visible outcome, not the implementation.
- Group related commits into one bullet; never list one bullet per commit. At most 10 bullets in total.
- Never mention commit hashes, file paths, dependency bumps or CI changes outside "Under the hood".
- "Improvements" covers polish, performance, UX and reliability. "Under the hood" is for meaningful internal work only (max 3 bullets).
- Only state what the commits support. Never invent features, fixes or numbers.
- If the release is mostly internal, omit "New features" and "Bug fixes" and rely on "Under the hood".`
}

function buildInput(tag, previousTag, changes) {
  const parts = [
    `Release: ${tag}`,
    previousTag
      ? `Previous release: ${previousTag}`
      : 'This is the first public release, so every change is new.',
    changes.commitList
      ? `Commits in this release (${changes.subjects.length}):\n${changes.commitList}`
      : 'No commits could be collected.',
    changes.diffStat ? `Diff: ${changes.diffStat}` : ''
  ]
  return parts.filter(Boolean).join('\n\n')
}

function extractOutputText(payload) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim()
  }

  const items = Array.isArray(payload?.output) ? payload.output : []
  return items
    .flatMap((item) => (Array.isArray(item?.content) ? item.content : []))
    .filter((part) => part?.type === 'output_text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('')
    .trim()
}

async function requestNotes(tag, previousTag, changes) {
  const apiKey = (process.env.OPENAI_API_KEY ?? '').trim()
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured')

  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: MODEL,
      instructions: instructionsFor(tag, previousTag),
      input: buildInput(tag, previousTag, changes),
      store: false
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  })

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500)
    throw new Error(`OpenAI responded ${response.status}: ${detail}`)
  }

  const payload = await response.json()
  const text = extractOutputText(payload)
  if (!text) throw new Error('OpenAI returned an empty response')

  const usage = payload?.usage
  if (usage) {
    console.log(
      `[release-notes] ${MODEL} usage: ${usage.input_tokens ?? '?'} input / ${
        usage.output_tokens ?? '?'} output tokens`
    )
  }

  return text
}

/** Turns "fix(ui): crash on start" into "Crash on start" for the fallback list. */
function humanizeSubject(subject) {
  const withoutType = subject.replace(/^[\w-]+(\([^)]*\))?!?:\s+/, '').trim() || subject.trim()
  return withoutType.charAt(0).toUpperCase() + withoutType.slice(1)
}

function fallbackNotes(tag, subjectList) {
  const bullets = subjectList.slice(0, 30).map((subject) => `- ${humanizeSubject(subject)}`)
  return [`## Covenant ${tag}`, '', ...bullets].join('\n')
}

function compareLink(repo, previousTag, tag) {
  if (!repo || !previousTag || !tag) return ''
  return `**Full changelog:** https://github.com/${repo}/compare/${previousTag}...${tag}`
}

function composeBody(notes, repo, previousTag, tag) {
  const link = compareLink(repo, previousTag, tag)
  const body = notes.trim()
  if (!link || body.includes('/compare/')) return body
  return `${body}\n\n${link}`.trim()
}

async function main() {
  const tag = resolveTag()
  const repo = (process.env.GITHUB_REPOSITORY ?? '').trim()

  const previousRelease = await findPreviousRelease(repo, tag)
  const previousTag = ensureLocalTag(previousRelease)
  console.log(`[release-notes] Generating notes for ${tag} (previous: ${previousTag ?? 'none'})`)

  const changes = collectChanges(previousTag)

  let body
  if (changes.subjects.length === 0) {
    console.warn('[release-notes] No commits found in range; skipping AI generation')
    body = composeBody(fallbackNotes(tag, []), repo, previousTag, tag)
  } else {
    try {
      const notes = await requestNotes(tag, previousTag, changes)
      body = composeBody(notes, repo, previousTag, tag)
    } catch (error) {
      console.warn(`[release-notes] Falling back to the raw changelog: ${error.message}`)
      body = composeBody(fallbackNotes(tag, changes.subjects), repo, previousTag, tag)
    }
  }

  if (!body.trim()) body = `## Covenant ${tag}`

  writeFileSync(OUTPUT_FILE, `${body.trimEnd()}\n`, 'utf8')
  console.log(`[release-notes] Wrote ${body.length} characters to release-notes.md`)
}

main().catch((error) => {
  // Last resort: never block the release because the notes could not be built.
  console.warn(`[release-notes] Unexpected failure: ${error?.message ?? error}`)
  try {
    writeFileSync(OUTPUT_FILE, 'Release notes could not be generated automatically.\n', 'utf8')
  } catch {
    // Nothing else we can do.
  }
})
