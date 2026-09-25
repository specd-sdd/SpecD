import { describe, expect, it } from 'vitest'
import { Change } from '../../../src/domain/entities/change.js'
import { InvalidChangeError } from '../../../src/domain/errors/invalid-change-error.js'

const actor = { type: 'human' as const, name: 'dev', email: 'dev@example.com' }

function change(name: string): Change {
  const at = new Date('2026-01-01T00:00:00.000Z')
  return new Change({
    name,
    createdAt: at,
    specIds: ['auth/login'],
    history: [
      {
        type: 'created',
        at,
        by: actor,
        specIds: ['auth/login'],
        schemaName: '@specd/schema-std',
        schemaVersion: 1,
      },
    ],
  })
}

describe('change names', () => {
  it('rejects Windows device names and accepts a longer slug', () => {
    expect(() => change('con')).toThrow(InvalidChangeError)
    expect(() => change('com1')).toThrow(InvalidChangeError)
    expect(change('con-foo').name).toBe('con-foo')
  })
})
