import { describe, expect, it } from 'vitest'
import { deepMergeConfig } from '../../../src/domain/services/deep-merge-config.js'

describe('deepMergeConfig', () => {
  it('returns empty object when both base and overlay are undefined', () => {
    expect(deepMergeConfig(undefined, undefined)).toEqual({})
  })

  it('returns shallow clone of base when overlay is undefined', () => {
    const base = { a: 1, b: 'two' }
    const result = deepMergeConfig(base, undefined)
    expect(result).toEqual({ a: 1, b: 'two' })
    expect(result).not.toBe(base)
  })

  it('returns shallow clone of overlay when base is undefined', () => {
    const overlay = { x: true, y: [1, 2] }
    const result = deepMergeConfig(undefined, overlay)
    expect(result).toEqual({ x: true, y: [1, 2] })
    expect(result).not.toBe(overlay)
  })

  it('deep merges nested plain objects', () => {
    const base = {
      linter: {
        strict: false,
        rules: {
          noUnused: 'warn',
          noAny: 'warn',
        },
      },
    }
    const overlay = {
      linter: {
        strict: true,
        rules: {
          noAny: 'error',
          preferConst: 'error',
        },
      },
    }

    const result = deepMergeConfig(base, overlay)
    expect(result).toEqual({
      linter: {
        strict: true,
        rules: {
          noUnused: 'warn',
          noAny: 'error',
          preferConst: 'error',
        },
      },
    })
  })

  it('concatenates arrays', () => {
    const base = { tags: ['alpha', 'beta'], nested: { list: [1, 2] } }
    const overlay = { tags: ['gamma'], nested: { list: [3] } }

    const result = deepMergeConfig(base, overlay)
    expect(result).toEqual({
      tags: ['alpha', 'beta', 'gamma'],
      nested: {
        list: [1, 2, 3],
      },
    })
  })

  it('ignores specified keys during merge from overlay', () => {
    const base = { name: 'base', timeout: 1000, keep: 'yes' }
    const overlay = { name: 'overlay', timeout: 5000, keep: 'override' }

    const result = deepMergeConfig(base, overlay, { ignoredKeys: ['name', 'timeout'] })
    expect(result).toEqual({
      name: 'base',
      timeout: 1000,
      keep: 'override',
    })
  })

  it('overwrites primitives with objects or objects with primitives', () => {
    const base1 = { val: 42 }
    const overlay1 = { val: { nested: true } }
    expect(deepMergeConfig(base1, overlay1)).toEqual({ val: { nested: true } })

    const base2 = { val: { nested: true } }
    const overlay2 = { val: 42 }
    expect(deepMergeConfig(base2, overlay2)).toEqual({ val: 42 })
  })
})
