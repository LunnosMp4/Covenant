import { describe, expect, it } from 'vitest'
import { fixWebmDuration } from './webm'

function element(id: number[], payload: Uint8Array): Uint8Array {
  // One-byte size is enough for the synthetic elements below.
  const out = new Uint8Array(id.length + 1 + payload.length)
  out.set(id, 0)
  out[id.length] = 0x80 | payload.length
  out.set(payload, id.length + 1)
  return out
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let cursor = 0
  for (const part of parts) {
    out.set(part, cursor)
    cursor += part.length
  }
  return out
}

function unknownSizeSegment(): Uint8Array {
  return new Uint8Array([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff])
}

/** Mimics the layout Chrome's MediaRecorder produces. */
function buildRecording(): Uint8Array {
  const ebmlHeader = element(
    [0x1a, 0x45, 0xdf, 0xa3],
    new Uint8Array([0x42, 0x86, 0x81, 0x01])
  )
  const timecodeScale = element([0x2a, 0xd7, 0xb1], new Uint8Array([0x0f, 0x42, 0x40]))
  const info = element([0x15, 0x49, 0xa9, 0x66], timecodeScale)
  const cluster = concat([
    new Uint8Array([0x1f, 0x43, 0xb6, 0x75]),
    unknownSizeSegment(),
    new Uint8Array([0x81, 0x00, 0x00])
  ])
  return concat([
    ebmlHeader,
    new Uint8Array([0x18, 0x53, 0x80, 0x67]),
    unknownSizeSegment(),
    info,
    cluster
  ])
}

function findSequence(data: Uint8Array, sequence: number[]): number {
  outer: for (let index = 0; index <= data.length - sequence.length; index += 1) {
    for (let offset = 0; offset < sequence.length; offset += 1) {
      if (data[index + offset] !== sequence[offset]) continue outer
    }
    return index
  }
  return -1
}

describe('fixWebmDuration', () => {
  it('inserts a duration into the Info header', () => {
    const original = buildRecording()
    const patched = fixWebmDuration(original, 12_500)

    expect(patched).not.toBeNull()
    const bytes = new Uint8Array(patched!)

    expect(bytes.length).toBe(original.length + 11)
    const offset = findSequence(bytes, [0x44, 0x89, 0x88])
    expect(offset).toBeGreaterThan(0)
    expect(new DataView(bytes.buffer).getFloat64(offset + 3, false)).toBeCloseTo(12_500, 5)

    // Idempotent: the patched file already carries the same duration.
    expect(fixWebmDuration(bytes, 12_500)).toBeNull()
  })

  it('updates an existing duration in place', () => {
    const original = buildRecording()
    const once = fixWebmDuration(original, 1_000)!
    const twice = fixWebmDuration(once, 2_000)!

    expect(twice.byteLength).toBe(once.byteLength)
    const bytes = new Uint8Array(twice)
    const offset = findSequence(bytes, [0x44, 0x89, 0x88])
    expect(new DataView(bytes.buffer).getFloat64(offset + 3, false)).toBeCloseTo(2_000, 5)
  })

  it('leaves non-MediaRecorder input alone', () => {
    expect(fixWebmDuration(new Uint8Array([1, 2, 3, 4]), 1_000)).toBeNull()
    expect(fixWebmDuration(buildRecording(), 0)).toBeNull()
  })
})
