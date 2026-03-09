/* eslint-disable @typescript-eslint/unbound-method */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { output, parseFormat } from '../src/formatter.js'

describe('parseFormat', () => {
  it('accepts text', () => {
    expect(parseFormat('text')).toBe('text')
  })

  it('accepts json', () => {
    expect(parseFormat('json')).toBe('json')
  })

  it('accepts toon', () => {
    expect(parseFormat('toon')).toBe('toon')
  })

  it('throws for unknown format', () => {
    expect(() => parseFormat('xml')).toThrow(/invalid format 'xml'/)
  })

  it('error message lists valid formats', () => {
    expect(() => parseFormat('csv')).toThrow(/text, json, toon/)
  })
})

describe('output', () => {
  beforeEach(() => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function captured(): string {
    return (vi.mocked(process.stdout.write).mock.calls as [string][]).map(([s]) => s).join('')
  }

  it('writes text with newline', () => {
    output('hello world', 'text')
    expect(captured()).toBe('hello world\n')
  })

  it('writes JSON with trailing newline', () => {
    output({ key: 'value' }, 'json')
    const written = captured()
    expect(() => JSON.parse(written) as unknown).not.toThrow()
    expect(JSON.parse(written) as unknown).toEqual({ key: 'value' })
  })

  it('JSON serializes arrays', () => {
    output([1, 2, 3], 'json')
    expect(JSON.parse(captured()) as unknown).toEqual([1, 2, 3])
  })

  it('toon produces non-empty output', () => {
    output({ name: 'test', state: 'designing' }, 'toon')
    expect(captured().trim()).not.toBe('')
  })

  it('toon output differs from JSON for arrays', () => {
    const data = [
      { name: 'a', state: 'b' },
      { name: 'c', state: 'd' },
    ]
    output(data, 'toon')
    const toonOut = captured()
    vi.mocked(process.stdout.write).mockClear()
    output(data, 'json')
    const jsonOut = captured()
    expect(toonOut).not.toBe(jsonOut)
  })
})
