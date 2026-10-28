import { describe, expect, it } from 'vitest'
import type { Preprompt } from '../../../../shared/domain/preprompt'
import { filterInstructionMentions, parseMentionTrigger } from './instructionMentions'

describe('parseMentionTrigger', () => {
  it('detects a mention at the start of the input', () => {
    expect(parseMentionTrigger('@')).toEqual({ query: '', start: 0 })
    expect(parseMentionTrigger('@code')).toEqual({ query: 'code', start: 0 })
  })

  it('detects a mention after whitespace', () => {
    expect(parseMentionTrigger('hello @co')).toEqual({ query: 'co', start: 6 })
  })

  it('ignores emails and mid-word @', () => {
    expect(parseMentionTrigger('foo@bar')).toBeNull()
  })

  it('closes when a space is typed', () => {
    expect(parseMentionTrigger('@code review')).toBeNull()
  })

  it('uses the last mention in the segment', () => {
    expect(parseMentionTrigger('a @one @two')).toEqual({ query: 'two', start: 7 })
  })
})

describe('filterInstructionMentions', () => {
  const items: Preprompt[] = [
    { id: '1', title: 'Code review', content: 'Review the diff carefully.' },
    { id: '2', title: 'Translator', content: 'Translate to French.' },
    { id: '3', title: 'Bug hunter', content: 'Find bugs in code.' }
  ]

  it('returns every instruction for an empty query', () => {
    expect(filterInstructionMentions(items, '').map((item) => item.id)).toEqual([
      '1',
      '2',
      '3'
    ])
  })

  it('ranks title matches above content matches', () => {
    expect(filterInstructionMentions(items, 'code').map((item) => item.id)).toEqual([
      '1',
      '3'
    ])
  })

  it('matches instruction content', () => {
    expect(filterInstructionMentions(items, 'french').map((item) => item.id)).toEqual([
      '2'
    ])
  })

  it('returns nothing when there is no match', () => {
    expect(filterInstructionMentions(items, 'zzz')).toEqual([])
  })
})
