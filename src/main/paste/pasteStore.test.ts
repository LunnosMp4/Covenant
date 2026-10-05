import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { PASTE_INLINE_TEXT_LIMIT } from '../../shared/paste/paste'
import { PasteStore } from './pasteStore'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'covenant-paste-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function addText(store: PasteStore, text: string, hash = text) {
  return store.add({
    type: 'text',
    preview: text.slice(0, 40),
    size: Buffer.byteLength(text),
    hash,
    text
  })
}

describe('PasteStore', () => {
  it('creates its directories on init', async () => {
    const store = new PasteStore(dir)
    await store.init()
    expect(existsSync(join(dir, 'items'))).toBe(true)
    expect(existsSync(join(dir, 'blobs'))).toBe(true)
  })

  it('stores small text inline and persists the index', async () => {
    const store = new PasteStore(dir)
    await store.init()
    const meta = await addText(store, 'hello world')
    expect(meta.inlineText).toBe('hello world')
    expect(meta.contentFile).toBeUndefined()

    await store.flush()
    expect(existsSync(join(dir, 'index.json'))).toBe(true)

    const reloaded = new PasteStore(dir)
    await reloaded.init()
    expect(reloaded.list()).toHaveLength(1)
    const detail = await reloaded.getDetail(meta.id)
    expect(detail?.text).toBe('hello world')
  })

  it('stores large text in a per-item file and lazy loads it', async () => {
    const store = new PasteStore(dir)
    await store.init()
    const large = 'x'.repeat(PASTE_INLINE_TEXT_LIMIT + 50)
    const meta = await addText(store, large)
    expect(meta.contentFile).toBe(`${meta.id}.json`)
    expect(meta.inlineText).toBeUndefined()

    const detail = await store.getDetail(meta.id)
    expect(detail?.text).toBe(large)
  })

  it('writes image blobs and thumbnails to disk', async () => {
    const store = new PasteStore(dir)
    await store.init()
    const meta = await store.add({
      type: 'image',
      preview: 'image',
      size: 4,
      hash: 'img',
      imageBuffer: Buffer.from([1, 2, 3, 4]),
      thumbnailBuffer: Buffer.from([9, 9]),
      imageWidth: 10,
      imageHeight: 10
    })
    expect(meta.blobFile).toBe(`${meta.id}.png`)
    expect(meta.thumbFile).toBe(`${meta.id}.thumb.png`)
    expect(store.getImagePath(meta.id, 'full')).toBeTruthy()
    expect(store.getImagePath(meta.id, 'thumb')).toBeTruthy()
  })

  it('orders pinned items first', async () => {
    const store = new PasteStore(dir)
    await store.init()
    const first = await addText(store, 'first', 'h1')
    const second = await addText(store, 'second', 'h2')
    store.setPinned(first.id, true)
    const list = store.list()
    expect(list[0].id).toBe(first.id)
    expect(list[1].id).toBe(second.id)
  })

  it('deletes items and their files', async () => {
    const store = new PasteStore(dir)
    await store.init()
    const large = 'y'.repeat(PASTE_INLINE_TEXT_LIMIT + 10)
    const meta = await addText(store, large)
    const contentPath = join(dir, 'items', meta.contentFile as string)
    expect(existsSync(contentPath)).toBe(true)

    expect(await store.delete(meta.id)).toBe(true)
    expect(existsSync(contentPath)).toBe(false)
    expect(store.list()).toHaveLength(0)
  })

  it('clears unpinned items but keeps pinned ones', async () => {
    const store = new PasteStore(dir)
    await store.init()
    const a = await addText(store, 'a')
    const b = await addText(store, 'b')
    store.setPinned(a.id, true)

    const removed = await store.clear(true)
    expect(removed).toBe(1)
    expect(store.list().map((item) => item.id)).toEqual([a.id])
    expect(store.getMeta(b.id)).toBeNull()
  })

  it('purges by age and count while preserving pins', async () => {
    const store = new PasteStore(dir)
    await store.init()
    const now = Date.now()
    const old = await store.add({ type: 'text', preview: 'old', size: 3, hash: 'old', text: 'old', createdAt: now - 40 * 86400000 })
    const pinnedOld = await store.add({ type: 'text', preview: 'pin', size: 3, hash: 'pin', text: 'pin', createdAt: now - 40 * 86400000 })
    store.setPinned(pinnedOld.id, true)
    const recent = await addText(store, 'recent')

    const removed = await store.purge({ maxItems: 100, maxAgeDays: 30 })
    expect(removed).toBe(1)
    expect(store.getMeta(old.id)).toBeNull()
    expect(store.getMeta(pinnedOld.id)).not.toBeNull()
    expect(store.getMeta(recent.id)).not.toBeNull()

    for (let i = 0; i < 5; i += 1) await addText(store, `extra-${i}`)
    await store.purge({ maxItems: 3, maxAgeDays: null })
    // pinned item + 3 newest unpinned
    expect(store.list().length).toBe(4)
  })

  it('tracks the most recent hash for dedup', async () => {
    const store = new PasteStore(dir)
    await store.init()
    await addText(store, 'one', 'hash-one')
    await addText(store, 'two', 'hash-two')
    expect(store.mostRecentHash()).toBe('hash-two')
  })
})
