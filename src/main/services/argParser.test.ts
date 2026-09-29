import { describe, expect, it } from 'vitest'
import { parseLaunchArguments } from './argParser'

describe('parseLaunchArguments', () => {
  it('returns an empty array for blank input', () => {
    expect(parseLaunchArguments('')).toEqual([])
    expect(parseLaunchArguments('   ')).toEqual([])
  })

  it('splits simple space-delimited tokens', () => {
    expect(parseLaunchArguments('--flag value extra')).toEqual(['--flag', 'value', 'extra'])
  })

  it('keeps double-quoted tokens as single arguments', () => {
    expect(parseLaunchArguments('open "C:\\Program Files\\App\\app.exe"')).toEqual([
      'open',
      'C:\\Program Files\\App\\app.exe'
    ])
  })

  it('keeps single-quoted tokens as single arguments', () => {
    expect(parseLaunchArguments("echo 'hello world'")).toEqual(['echo', 'hello world'])
  })

  it('handles mixed quoting', () => {
    expect(parseLaunchArguments('--name "John Doe" --path \'a b\'')).toEqual([
      '--name',
      'John Doe',
      '--path',
      'a b'
    ])
  })
})