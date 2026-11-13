import { describe, it, expect } from 'vitest'
import { workspacesFromSpecIds } from '../../src/domain/archived-change-index-entry.js'
import { InvalidSpecIdError } from '../../src/domain/errors/invalid-spec-id-error.js'

describe('workspacesFromSpecIds', () => {
  it('returns unique workspaces in encounter order', () => {
    expect(workspacesFromSpecIds(['core:a', 'default:b', 'core:c'])).toEqual(['core', 'default'])
  })

  it('maps a bare ID to the default workspace', () => {
    expect(workspacesFromSpecIds(['auth/login'])).toEqual(['default'])
    expect(workspacesFromSpecIds(['core:a', 'auth/login', 'default:b'])).toEqual([
      'core',
      'default',
    ])
  })

  it('returns an empty list for no IDs', () => {
    expect(workspacesFromSpecIds([])).toEqual([])
  })

  it.each([['a:b:c'], ['']])('rejects %j with InvalidSpecIdError', (id) => {
    expect(() => workspacesFromSpecIds([id])).toThrow(InvalidSpecIdError)
  })
})
