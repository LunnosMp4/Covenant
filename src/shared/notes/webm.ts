/**
 * MediaRecorder writes WebM with an unknown Segment size and no Duration
 * element. Chromium then reports `duration === Infinity` for the file and
 * seeking snaps back to the start, which breaks timeline scrubbing.
 *
 * This patches a Duration element into the Info header so the saved segments
 * are seekable. It only handles the exact layout MediaRecorder produces (EBML
 * header → Segment with unknown size → Info) and returns null for anything
 * else, so callers can keep serving the original bytes.
 */

const EBML_HEADER_ID = 0x1a45dfa3
const SEGMENT_ID = 0x18538067
const INFO_ID = 0x1549a966
const TIMECODE_SCALE_ID = 0x2ad7b1
const DURATION_ID = 0x4489
const DEFAULT_TIMECODE_SCALE = 1_000_000

/** Duration id (2) + size (1) + float64 value (8). */
const DURATION_ELEMENT_LENGTH = 11

interface VariableInt {
  value: number
  length: number
  unknown: boolean
}

function readElementId(
  data: Uint8Array,
  offset: number
): { id: number; length: number } | null {
  const first = data[offset]
  if (first == null || first === 0) return null

  let length = 1
  let mask = 0x80
  while (length <= 4 && (first & mask) === 0) {
    mask >>= 1
    length += 1
  }
  if (length > 4 || offset + length > data.length) return null

  let id = 0
  for (let index = 0; index < length; index += 1) {
    id = id * 256 + data[offset + index]
  }
  return { id, length }
}

function readSize(data: Uint8Array, offset: number): VariableInt | null {
  const first = data[offset]
  if (first == null || first === 0) return null

  let length = 1
  let mask = 0x80
  while (length <= 8 && (first & mask) === 0) {
    mask >>= 1
    length += 1
  }
  if (length > 8 || offset + length > data.length) return null

  let value = first & (mask - 1)
  let unknown = value === mask - 1
  for (let index = 1; index < length; index += 1) {
    const byte = data[offset + index]
    if (byte !== 0xff) unknown = false
    value = value * 256 + byte
  }
  return { value, length, unknown }
}

function encodeSize(value: number): Uint8Array {
  let length = 1
  while (length < 8 && value >= 2 ** (7 * length) - 1) length += 1

  const bytes = new Uint8Array(length)
  let remaining = value
  for (let index = length - 1; index >= 0; index -= 1) {
    bytes[index] = remaining % 256
    remaining = Math.floor(remaining / 256)
  }
  bytes[0] |= 1 << (8 - length)
  return bytes
}

/**
 * Returns a new buffer with a Duration written into the WebM header, or null
 * when the file already has the right duration / is not a MediaRecorder file.
 */
export function fixWebmDuration(
  input: ArrayBuffer | Uint8Array,
  durationMs: number
): ArrayBuffer | null {
  const data = input instanceof Uint8Array ? input : new Uint8Array(input)
  if (!(durationMs > 0) || data.length < 32) return null

  const header = readElementId(data, 0)
  if (!header || header.id !== EBML_HEADER_ID) return null
  const headerSize = readSize(data, header.length)
  if (!headerSize || headerSize.unknown) return null

  const segmentOffset = header.length + headerSize.length + headerSize.value
  const segment = readElementId(data, segmentOffset)
  if (!segment || segment.id !== SEGMENT_ID) return null
  const segmentSize = readSize(data, segmentOffset + segment.length)
  // A known Segment size would need to be updated too; MediaRecorder uses an
  // unknown size, so bail out on anything else.
  if (!segmentSize || !segmentSize.unknown) return null

  const infoOffset = segmentOffset + segment.length + segmentSize.length
  const info = readElementId(data, infoOffset)
  if (!info || info.id !== INFO_ID) return null
  const infoSize = readSize(data, infoOffset + info.length)
  if (!infoSize || infoSize.unknown) return null

  const infoPayloadStart = infoOffset + info.length + infoSize.length
  const infoPayloadEnd = infoPayloadStart + infoSize.value
  if (infoPayloadEnd > data.length) return null

  let timecodeScale = DEFAULT_TIMECODE_SCALE
  let durationOffset = -1
  let durationWidth = 0

  let offset = infoPayloadStart
  while (offset < infoPayloadEnd) {
    const child = readElementId(data, offset)
    if (!child) break
    const childSize = readSize(data, offset + child.length)
    if (!childSize || childSize.unknown) break

    const payloadStart = offset + child.length + childSize.length
    const payloadEnd = payloadStart + childSize.value
    if (payloadEnd > infoPayloadEnd) break

    if (child.id === TIMECODE_SCALE_ID && childSize.value > 0 && childSize.value <= 8) {
      let scale = 0
      for (let index = payloadStart; index < payloadEnd; index += 1) {
        scale = scale * 256 + data[index]
      }
      if (scale > 0) timecodeScale = scale
    } else if (child.id === DURATION_ID && (childSize.value === 4 || childSize.value === 8)) {
      durationOffset = payloadStart
      durationWidth = childSize.value
    }
    offset = payloadEnd
  }

  const durationValue = (durationMs * DEFAULT_TIMECODE_SCALE) / timecodeScale
  const durationView = new DataView(data.buffer, data.byteOffset, data.byteLength)

  if (durationOffset >= 0) {
    const current =
      durationWidth === 4
        ? durationView.getFloat32(durationOffset, false)
        : durationView.getFloat64(durationOffset, false)
    if (Number.isFinite(current) && Math.abs(current - durationValue) < 0.5) return null

    const output = new Uint8Array(data)
    const outputView = new DataView(output.buffer)
    if (durationWidth === 4) outputView.setFloat32(durationOffset, durationValue, false)
    else outputView.setFloat64(durationOffset, durationValue, false)
    return output.buffer
  }

  const durationElement = new Uint8Array(DURATION_ELEMENT_LENGTH)
  durationElement[0] = 0x44
  durationElement[1] = 0x89
  durationElement[2] = 0x88
  new DataView(durationElement.buffer).setFloat64(3, durationValue, false)

  const newInfoSize = infoSize.value + DURATION_ELEMENT_LENGTH
  const sizeBytes = encodeSize(newInfoSize)
  const sizeDelta = sizeBytes.length - infoSize.length
  const output = new Uint8Array(data.length + DURATION_ELEMENT_LENGTH + sizeDelta)
  const infoIdEnd = infoOffset + info.length

  output.set(data.subarray(0, infoIdEnd), 0)
  let cursor = infoIdEnd
  output.set(sizeBytes, cursor)
  cursor += sizeBytes.length
  output.set(data.subarray(infoPayloadStart, infoPayloadEnd), cursor)
  cursor += infoSize.value
  output.set(durationElement, cursor)
  cursor += DURATION_ELEMENT_LENGTH
  output.set(data.subarray(infoPayloadEnd), cursor)

  return output.buffer
}
