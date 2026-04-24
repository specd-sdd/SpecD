import { describe, it, expect } from 'vitest'
import { RelationType, isRelationType } from '../../../src/domain/value-objects/relation-type.js'

describe('RelationType', () => {
  it('defines all expected members', () => {
    expect(RelationType.Imports).toBe('IMPORTS')
    expect(RelationType.Defines).toBe('DEFINES')
    expect(RelationType.Calls).toBe('CALLS')
    expect(RelationType.Constructs).toBe('CONSTRUCTS')
    expect(RelationType.UsesType).toBe('USES_TYPE')
    expect(RelationType.Exports).toBe('EXPORTS')
    expect(RelationType.DependsOn).toBe('DEPENDS_ON')
    expect(RelationType.Covers).toBe('COVERS')
    expect(RelationType.Extends).toBe('EXTENDS')
    expect(RelationType.Implements).toBe('IMPLEMENTS')
    expect(RelationType.Overrides).toBe('OVERRIDES')
  })

  it('isRelationType returns true for valid types', () => {
    expect(isRelationType('IMPORTS')).toBe(true)
    expect(isRelationType('CALLS')).toBe(true)
    expect(isRelationType('CONSTRUCTS')).toBe(true)
    expect(isRelationType('USES_TYPE')).toBe(true)
    expect(isRelationType('EXTENDS')).toBe(true)
    expect(isRelationType('IMPLEMENTS')).toBe(true)
    expect(isRelationType('OVERRIDES')).toBe(true)
  })

  it('isRelationType returns false for invalid types', () => {
    expect(isRelationType('REFERENCES')).toBe(false)
    expect(isRelationType('')).toBe(false)
  })
})
