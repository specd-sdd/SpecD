import { describe, expect, it } from 'vitest'
import { selectManagedNames } from '../../src/application/select-managed-names.js'

const managed = ['specd', 'specd-new']

describe('selectManagedNames', () => {
  it('given managed names, when selected, then they are accepted in request order', () => {
    expect(selectManagedNames(['specd-new', 'specd'], managed)).toEqual({
      accepted: ['specd-new', 'specd'],
      skipped: [],
    })
  })

  it('given an unmanaged name, when selected, then it is skipped as not managed', () => {
    expect(selectManagedNames(['my-user-skill'], managed)).toEqual({
      accepted: [],
      skipped: [{ skill: 'my-user-skill', reason: 'not a specd-managed item' }],
    })
  })

  it.each(['..', '.', '', '../x', 'a/b', 'a\\b', '/abs', 'specd/..'])(
    'given the unsafe name %j, when selected, then it is skipped as invalid even if it looks managed',
    (name) => {
      expect(selectManagedNames([name], [...managed, name])).toEqual({
        accepted: [],
        skipped: [{ skill: name, reason: 'invalid name' }],
      })
    },
  )

  it('given a NUL byte name, when selected, then it is skipped as invalid', () => {
    expect(selectManagedNames(['sp\0ecd'], ['sp\0ecd']).skipped).toHaveLength(1)
  })

  it('given a mix, when selected, then managed names are accepted and the rest reported', () => {
    const result = selectManagedNames(['specd', '..', 'nope'], managed)
    expect(result.accepted).toEqual(['specd'])
    expect(result.skipped.map((s) => s.skill)).toEqual(['..', 'nope'])
  })

  it.each(['__proto__', 'constructor', 'toString'])(
    'given the prototype property name %j, when selected, then it is skipped as not managed',
    (name) => {
      expect(selectManagedNames([name], managed)).toEqual({
        accepted: [],
        skipped: [{ skill: name, reason: 'not a specd-managed item' }],
      })
    },
  )

  it('given non-string entries, when selected, then they are skipped as invalid and nothing throws', () => {
    const result = selectManagedNames([null, undefined, 42, {}, ['specd'], 'specd'], managed)
    expect(result.accepted).toEqual(['specd'])
    expect(result.skipped).toHaveLength(5)
    expect(result.skipped.every((entry) => entry.reason === 'invalid name')).toBe(true)
  })
})
