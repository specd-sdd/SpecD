import { describe, it, expect } from 'vitest'
import { CodeGraphError } from '../../../src/domain/errors/code-graph-error.js'
import { InvalidSymbolKindError } from '../../../src/domain/errors/invalid-symbol-kind-error.js'
import { InvalidRelationTypeError } from '../../../src/domain/errors/invalid-relation-type-error.js'
import { DuplicateSymbolIdError } from '../../../src/domain/errors/duplicate-symbol-id-error.js'
import { StoreNotOpenError } from '../../../src/domain/errors/store-not-open-error.js'

describe('CodeGraphError hierarchy', () => {
  it('InvalidSymbolKindError extends CodeGraphError', () => {
    const error = new InvalidSymbolKindError('bogus')
    expect(error).toBeInstanceOf(CodeGraphError)
    expect(error).toBeInstanceOf(Error)
    expect(error.code).toBe('INVALID_SYMBOL_KIND')
    expect(error.message).toContain('bogus')
    expect(error.name).toBe('InvalidSymbolKindError')
  })

  it('InvalidRelationTypeError extends CodeGraphError', () => {
    const error = new InvalidRelationTypeError('NOPE')
    expect(error).toBeInstanceOf(CodeGraphError)
    expect(error.code).toBe('INVALID_RELATION_TYPE')
    expect(error.message).toContain('NOPE')
  })

  it('DuplicateSymbolIdError extends CodeGraphError', () => {
    const error = new DuplicateSymbolIdError('some-id')
    expect(error).toBeInstanceOf(CodeGraphError)
    expect(error.code).toBe('DUPLICATE_SYMBOL_ID')
    expect(error.message).toContain('some-id')
  })

  it('StoreNotOpenError extends CodeGraphError', () => {
    const error = new StoreNotOpenError()
    expect(error).toBeInstanceOf(CodeGraphError)
    expect(error.code).toBe('STORE_NOT_OPEN')
  })
})
