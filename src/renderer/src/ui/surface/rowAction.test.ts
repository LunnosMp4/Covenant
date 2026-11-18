import { describe, expect, it } from 'vitest'
import { rowActionPrompt } from './rowAction'

describe('rowActionPrompt', () => {
  const row = ['nightly-2411', 'Passed', '1m 42s']

  it('fills the first cell and the visible row number', () => {
    expect(rowActionPrompt('Why did {row} fail?', row, 3)).toBe('Why did nightly-2411 fail?')
    expect(rowActionPrompt('Explain row {index}', row, 1)).toBe('Explain row 1')
  })

  it('fills an explicit cell index', () => {
    expect(rowActionPrompt('Duration of {row.2}?', row, 2)).toBe('Duration of 1m 42s?')
  })

  it('leaves unknown placeholders and missing cells readable', () => {
    expect(rowActionPrompt('{row.9} / {other}', row, 1)).toBe('{row.9} / {other}')
  })

  it('handles an empty row without throwing', () => {
    expect(rowActionPrompt('Row {row} {index}', [], 1)).toBe('Row  1')
  })
})
