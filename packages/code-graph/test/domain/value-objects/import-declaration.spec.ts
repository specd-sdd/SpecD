import { describe, expect, it } from 'vitest'
import { type ImportDeclaration } from '../../../src/domain/value-objects/import-declaration.js'
import { ImportDeclarationKind } from '../../../src/domain/value-objects/import-declaration-kind.js'

describe('ImportDeclaration', () => {
  it('represents file-only side-effect imports without local names', () => {
    const declaration: ImportDeclaration = {
      localName: '',
      originalName: '',
      specifier: './polyfill.js',
      isRelative: true,
      kind: ImportDeclarationKind.SideEffect,
    }

    expect(declaration.localName).toBe('')
    expect(declaration.originalName).toBe('')
    expect(declaration.kind).toBe(ImportDeclarationKind.SideEffect)
  })

  it('keeps named imports compatible when kind is omitted', () => {
    const declaration: ImportDeclaration = {
      localName: 'makeUser',
      originalName: 'createUser',
      specifier: './user.js',
      isRelative: true,
    }

    expect(declaration.kind).toBeUndefined()
    expect(declaration.localName).toBe('makeUser')
  })
})
