import { describe, expect, it } from 'vitest'
import { applyPersistedImplementationMutation } from '../../../../src/application/use-cases/_shared/apply-persisted-implementation-mutation.js'

describe('applyPersistedImplementationMutation', () => {
  it('adds a new implementation link', () => {
    const result = applyPersistedImplementationMutation([], {
      action: 'add',
      file: 'default:src/auth.ts',
      symbols: ['login'],
    })

    expect(result).toEqual([{ file: 'default:src/auth.ts', symbols: ['login'] }])
  })

  it('merges symbols additively on add', () => {
    const current = [{ file: 'default:src/auth.ts', symbols: ['login'] }]
    const result = applyPersistedImplementationMutation(current, {
      action: 'add',
      file: 'default:src/auth.ts',
      symbols: ['logout'],
    })

    expect(result).toEqual([{ file: 'default:src/auth.ts', symbols: ['login', 'logout'] }])
  })

  it('removes selected symbols before removing the whole entry', () => {
    const current = [{ file: 'default:src/auth.ts', symbols: ['login', 'logout'] }]
    const result = applyPersistedImplementationMutation(current, {
      action: 'remove',
      file: 'default:src/auth.ts',
      symbols: ['login'],
    })

    expect(result).toEqual([{ file: 'default:src/auth.ts', symbols: ['logout'] }])
  })

  it('removes the whole entry when remove has no symbols', () => {
    const current = [{ file: 'default:src/auth.ts', symbols: ['login'] }]
    const result = applyPersistedImplementationMutation(current, {
      action: 'remove',
      file: 'default:src/auth.ts',
    })

    expect(result).toEqual([])
  })
})
