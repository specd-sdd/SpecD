import { describe, it, expect } from 'vitest'
import { SpecdCodeGraphError } from '../../../src/domain/errors/specd-code-graph-error.js'
import { InvalidSymbolKindError } from '../../../src/domain/errors/invalid-symbol-kind-error.js'
import { InvalidRelationTypeError } from '../../../src/domain/errors/invalid-relation-type-error.js'
import { DuplicateSymbolIdError } from '../../../src/domain/errors/duplicate-symbol-id-error.js'
import { StoreNotOpenError } from '../../../src/domain/errors/store-not-open-error.js'
import { SpecdError } from '@specd/core'

describe('SpecdCodeGraphError hierarchy', () => {
  it('InvalidSymbolKindError extends SpecdCodeGraphError', () => {
    const error = new InvalidSymbolKindError('bogus')
    expect(error).toBeInstanceOf(SpecdCodeGraphError)
    expect(error).toBeInstanceOf(SpecdError)
    expect(error).toBeInstanceOf(Error)
    expect(error.code).toBe('INVALID_SYMBOL_KIND')
    expect(error.message).toContain('bogus')
    expect(error.name).toBe('InvalidSymbolKindError')
    expect(error.specd).toBe(true)
  })

  it('InvalidRelationTypeError extends SpecdCodeGraphError', () => {
    const error = new InvalidRelationTypeError('NOPE')
    expect(error).toBeInstanceOf(SpecdCodeGraphError)
    expect(error.code).toBe('INVALID_RELATION_TYPE')
    expect(error.message).toContain('NOPE')
  })

  it('DuplicateSymbolIdError extends SpecdCodeGraphError', () => {
    const error = new DuplicateSymbolIdError('some-id')
    expect(error).toBeInstanceOf(SpecdCodeGraphError)
    expect(error.code).toBe('DUPLICATE_SYMBOL_ID')
    expect(error.message).toContain('some-id')
  })

  it('StoreNotOpenError extends SpecdCodeGraphError', () => {
    const error = new StoreNotOpenError()
    expect(error).toBeInstanceOf(SpecdCodeGraphError)
    expect(error.code).toBe('STORE_NOT_OPEN')
  })
})
