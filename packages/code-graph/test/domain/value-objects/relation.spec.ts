import { describe, it, expect } from 'vitest'
import { createRelation } from '../../../src/domain/value-objects/relation.js'
import { RelationType } from '../../../src/domain/value-objects/relation-type.js'
import { InvalidRelationTypeError } from '../../../src/domain/errors/invalid-relation-type-error.js'

describe('Relation', () => {
  it('creates a valid relation', () => {
    const rel = createRelation({
      source: 'src/a.ts',
      target: 'src/b.ts',
      type: RelationType.Imports,
    })
    expect(rel.source).toBe('src/a.ts')
    expect(rel.target).toBe('src/b.ts')
    expect(rel.type).toBe('IMPORTS')
    expect(rel.metadata).toBeUndefined()
  })

  it('supports metadata', () => {
    const rel = createRelation({
      source: 'src/a.ts',
      target: 'src/b.ts',
      type: RelationType.Imports,
      metadata: { specifier: './b.js' },
    })
    expect(rel.metadata).toEqual({ specifier: './b.js' })
  })

  it('throws InvalidRelationTypeError for invalid type', () => {
    expect(() => createRelation({ source: 'a', target: 'b', type: 'INVALID' })).toThrow(
      InvalidRelationTypeError,
    )
  })
})
