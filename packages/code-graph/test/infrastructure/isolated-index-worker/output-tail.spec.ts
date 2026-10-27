import { describe, expect, it } from 'vitest'
import {
  OutputTail,
  OUTPUT_TAIL_MAX_BYTES,
} from '../../../src/infrastructure/isolated-index-worker/output-tail.js'

describe('OutputTail', () => {
  it('preserves order of multiple pushed chunks', () => {
    const tail = new OutputTail()
    tail.push('hello ')
    tail.push(Buffer.from('world'))
    tail.push('!')
    expect(tail.toString()).toBe('hello world!')
  })

  it('bounds buffer to default 16 KiB retaining the most recent data', () => {
    const tail = new OutputTail()
    const chunk1 = 'a'.repeat(10_000)
    const chunk2 = 'b'.repeat(10_000)
    tail.push(chunk1)
    tail.push(chunk2)

    const rendered = tail.toString()
    expect(Buffer.byteLength(rendered, 'utf-8')).toBe(OUTPUT_TAIL_MAX_BYTES)
    expect(rendered.endsWith('b'.repeat(10_000))).toBe(true)
    expect(rendered.startsWith('a'.repeat(OUTPUT_TAIL_MAX_BYTES - 10_000))).toBe(true)
  })

  it('supports custom maxBytes bound', () => {
    const tail = new OutputTail(10)
    tail.push('12345678')
    tail.push('90abcdef')
    expect(tail.toString()).toBe('7890abcdef')
  })

  it('handles multibyte UTF-8 boundary cuts with non-fatal replacement characters', () => {
    // 3-byte character '€' is [0xE2, 0x82, 0xAC]
    const tail = new OutputTail(4)
    // Push prefix + incomplete sequence cut by bound
    const euro = Buffer.from('€')
    tail.push('ab')
    tail.push(euro) // 2 + 3 = 5 bytes -> sliced to 4 bytes: 'b' + [0xE2, 0x82, 0xAC]
    expect(tail.toString()).toBe('b€')

    // Incomplete boundary sequence
    const tail2 = new OutputTail(2)
    tail2.push(euro) // 3 bytes -> sliced to 2 bytes: [0x82, 0xAC] which is invalid UTF-8 without lead byte
    expect(tail2.toString()).toContain('\uFFFD')
  })

  it('drops buffer on dispose and ignores subsequent pushes', () => {
    const tail = new OutputTail()
    tail.push('some diagnostic output')
    expect(tail.toString()).toBe('some diagnostic output')

    tail.dispose()
    expect(tail.toString()).toBe('')

    // Subsequent pushes are no-ops
    tail.push('more output')
    expect(tail.toString()).toBe('')
  })
})
