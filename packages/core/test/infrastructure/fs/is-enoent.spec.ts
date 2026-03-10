import { describe, expect, it } from 'vitest'
import { isEnoent } from '../../../src/infrastructure/fs/is-enoent.js'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('isEnoent', () => {
  it('returns true for ENOENT errors', () => {
    const err = Object.assign(new Error('not found'), { code: 'ENOENT' })
    expect(isEnoent(err)).toBe(true)
  })

  it('returns true for plain objects with code ENOENT', () => {
    const err = { code: 'ENOENT', message: 'no such file' }
    expect(isEnoent(err)).toBe(true)
  })

  it('returns false for other error codes', () => {
    const err = Object.assign(new Error('permission denied'), { code: 'EACCES' })
    expect(isEnoent(err)).toBe(false)
  })

  it('returns false for errors without a code', () => {
    const err = new Error('generic error')
    expect(isEnoent(err)).toBe(false)
  })

  it('returns false for null', () => {
    expect(isEnoent(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isEnoent(undefined)).toBe(false)
  })

  it('returns false for strings', () => {
    expect(isEnoent('ENOENT')).toBe(false)
  })

  it('returns false for numbers', () => {
    expect(isEnoent(42)).toBe(false)
  })
})
