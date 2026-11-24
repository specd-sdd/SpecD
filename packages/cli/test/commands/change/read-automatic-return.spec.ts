import { describe, it, expect } from 'vitest'
import { readAutomaticReturn } from '../../../src/commands/change/_validity-present.js'

describe('readAutomaticReturn', () => {
  it('keeps an absent value undefined', () => {
    expect(readAutomaticReturn(undefined)).toBeUndefined()
  })

  it('keeps a reported "none" as null', () => {
    expect(readAutomaticReturn(null)).toBeNull()
  })

  it('copies cause, from and to into a new object', () => {
    const source = {
      cause: 'artifact-invalidated',
      from: 'implementing',
      to: 'designing',
      extra: 'ignored',
    } as never
    const result = readAutomaticReturn(source)
    expect(result).toEqual({ cause: 'artifact-invalidated', from: 'implementing', to: 'designing' })
    expect(result).not.toBe(source)
  })
})
