import { describe, expect, it } from 'vitest'
import { InvalidLanguageAdapterError } from '../../../src/domain/errors/invalid-language-adapter-error.js'

describe('InvalidLanguageAdapterError', () => {
  it('Given declared languages and a rule, when created, then the message names both', () => {
    const error = new InvalidLanguageAdapterError(
      ['python', 'pyi'],
      'languages() returned no language',
    )

    expect(error.code).toBe('INVALID_LANGUAGE_ADAPTER')
    expect(error.message).toBe(
      'Invalid language adapter [python, pyi]: languages() returned no language',
    )
  })

  it('Given a member, when created, then the message names the offending member', () => {
    const error = new InvalidLanguageAdapterError(
      ['typescript'],
      'facet "packageResolution" is missing member "entrySurface"',
      'entrySurface',
    )

    expect(error.message).toBe(
      'Invalid language adapter [typescript]: facet "packageResolution" is missing member "entrySurface" (member "entrySurface")',
    )
  })

  it('Given no declared languages, when created, then the message uses "unknown"', () => {
    const error = new InvalidLanguageAdapterError([], 'missing required member "analyzeFile"')

    expect(error.message).toBe(
      'Invalid language adapter [unknown]: missing required member "analyzeFile"',
    )
  })

  it('Given the error, when inspected, then it is a SpecdError', () => {
    const error = new InvalidLanguageAdapterError([], 'rule')

    expect((error as unknown as { specd: boolean }).specd).toBe(true)
  })
})
