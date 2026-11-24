import { describe, expect, it } from 'vitest'
import { splitStreamedMarkdown } from './markdownStream'

/** The split must never lose or reorder a character. */
function expectLossless(content: string): void {
  const { blocks, tail } = splitStreamedMarkdown(content)
  const rebuilt = [...blocks, tail].filter((part) => part.length > 0).join('\n')
  expect(rebuilt).toBe(content)
}

/** Blocks keep the blank lines that separate them; compare their content. */
function blockTexts(content: string): string[] {
  return splitStreamedMarkdown(content).blocks.map((block) => block.trim())
}

describe('splitStreamedMarkdown', () => {
  it('keeps a document with a single block in the tail', () => {
    const content = '# A title\n\nstill being written'
    const { blocks, tail } = splitStreamedMarkdown(content)
    expectLossless(content)
    expect(blocks.map((b) => b.trim())).toEqual(['# A title'])
    expect(tail).toBe('still being written')
  })

  it('returns one block per completed top-level block', () => {
    const content = 'First paragraph.\n\nSecond paragraph.\n\nThird still growing'
    const { blocks, tail } = splitStreamedMarkdown(content)
    expectLossless(content)
    expect(blockTexts(content)).toEqual(['First paragraph.', 'Second paragraph.'])
    expect(tail).toBe('Third still growing')
  })

  it('keeps everything in the tail until a block boundary exists', () => {
    const content = 'one single paragraph with no blank line yet'
    const { blocks, tail } = splitStreamedMarkdown(content)
    expect(blocks).toEqual([])
    expect(tail).toBe(content)
  })

  it('never cuts inside a fenced code block', () => {
    const content = 'Intro.\n\n```ts\nconst a = 1\n\nconst b = 2\n```\n\nAfter the block'
    const { blocks, tail } = splitStreamedMarkdown(content)
    expectLossless(content)
    expect(blockTexts(content)).toEqual(['Intro.', '```ts\nconst a = 1\n\nconst b = 2\n```'])
    expect(tail).toBe('After the block')
  })

  it('never cuts inside a $$ math block', () => {
    const content = 'Intro.\n\n$$\na + b\n\nc + d\n$$\n\nAfter'
    const { blocks, tail } = splitStreamedMarkdown(content)
    expectLossless(content)

    expect(tail).toBe('After')
  })

  it('keeps a loose list together', () => {
    const content = 'Intro.\n\n- one\n\n- two\n\n- three'
    const { blocks, tail } = splitStreamedMarkdown(content)
    expectLossless(content)
    expect(blockTexts(content)).toEqual(['Intro.'])
    expect(tail).toBe('- one\n\n- two\n\n- three')
  })

  it('keeps blockquotes together', () => {
    const content = 'Intro.\n\n> quoted\n\n> still quoted'
    const { blocks, tail } = splitStreamedMarkdown(content)
    expectLossless(content)
    expect(blockTexts(content)).toEqual(['Intro.'])
    expect(tail).toBe('> quoted\n\n> still quoted')
  })

  it('keeps an indented code block together', () => {
    const content = 'Intro.\n\n    const a = 1\n\n    const b = 2'
    const { blocks, tail } = splitStreamedMarkdown(content)
    expectLossless(content)
    expect(blockTexts(content)).toEqual(['Intro.'])
    expect(tail).toBe('    const a = 1\n\n    const b = 2')
  })

  it('does not split a document that uses reference link definitions', () => {
    const content = 'See [the docs][ref].\n\n[ref]: https://example.com\n\nMore text'
    const { blocks, tail } = splitStreamedMarkdown(content)
    expect(blocks).toEqual([])
    expect(tail).toBe(content)
  })

  it('lets a streaming table stay in one piece', () => {
    const content =
      'Pricing:\n\n| Plan | Price |\n| --- | --- |\n| a | 1 |\n\nNotes still streaming'
    const { blocks, tail } = splitStreamedMarkdown(content)
    expectLossless(content)
    expect(blockTexts(content)).toEqual(['Pricing:', '| Plan | Price |\n| --- | --- |\n| a | 1 |'])
    expect(tail).toBe('Notes still streaming')
  })

  it('keeps a table with a blank-separated body whole', () => {
    const content = '| a | b |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |\n\nnext'
    const { blocks, tail } = splitStreamedMarkdown(content)
    expectLossless(content)
    expect(blockTexts(content)[0]).toBe('| a | b |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |')
    expect(tail).toBe('next')
  })

  it('advances monotonically while an answer streams', () => {
    const answer = [
      '# Report',
      '',
      'Intro paragraph.',
      '',
      '- one',
      '- two',
      '',
      '| a | b |',
      '| --- | --- |',
      '| 1 | 2 |',
      '',
      '```ts',
      'const x = 1',
      '```',
      '',
      'Final paragraph.'
    ].join('\n')

    let previousBlocks: string[] = []
    for (let length = 1; length <= answer.length; length += 1) {
      const chunk = answer.slice(0, length)
      const { blocks } = splitStreamedMarkdown(chunk)
      expectLossless(chunk)
      // Completed blocks are final: they only ever accumulate.
      expect(blocks.slice(0, previousBlocks.length)).toEqual(previousBlocks)
      previousBlocks = blocks
    }
  })

  it('tolerates CRLF content', () => {
    const content = 'First.\r\n\r\nSecond.\r\n\r\nThird'
    const { blocks, tail } = splitStreamedMarkdown(content)
    expect(blockTexts(content)).toEqual(['First.', 'Second.'])
    expect(tail).toBe('Third')
  })

  it('splits every paragraph of a long table-heavy answer', () => {
    const content = Array.from({ length: 20 }, (_, i) => `Paragraph ${i}.`).join('\n\n')
    const document = `${content}\n\ntail`
    const { blocks } = splitStreamedMarkdown(document)
    expect(blocks).toHaveLength(20)
    expect(blockTexts(document)[0]).toBe('Paragraph 0.')
    expect(blockTexts(document)[19]).toBe('Paragraph 19.')
  })
})
