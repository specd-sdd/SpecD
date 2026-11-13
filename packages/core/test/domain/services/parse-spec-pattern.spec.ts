import { describe, expect, it } from 'vitest'
import { parseSpecPattern } from '../../../src/domain/services/parse-spec-pattern.js'
import { validateContextPattern } from '../../../src/application/ports/config-schema.js'
import { ConfigValidationError } from '../../../src/domain/errors/config-validation-error.js'
import { InvalidSpecPatternError } from '../../../src/domain/errors/invalid-spec-pattern-error.js'

describe('parseSpecPattern', () => {
  it('parses * as all with a null workspace', () => {
    expect(parseSpecPattern('*')).toEqual({ workspace: null, kind: 'all', path: '*' })
  })

  it('parses a workspace-qualified all pattern', () => {
    expect(parseSpecPattern('core:*')).toEqual({ workspace: 'core', kind: 'all', path: '*' })
  })

  it('parses a prefix pattern without a qualifier', () => {
    expect(parseSpecPattern('_global/*')).toEqual({
      workspace: null,
      kind: 'prefix',
      path: '_global',
    })
  })

  it('parses a workspace-qualified prefix pattern', () => {
    expect(parseSpecPattern('core:team/*')).toEqual({
      workspace: 'core',
      kind: 'prefix',
      path: 'team',
    })
  })

  it('parses an exact path', () => {
    expect(parseSpecPattern('core:change')).toEqual({
      workspace: 'core',
      kind: 'exact',
      path: 'change',
    })
    expect(parseSpecPattern('auth/login')).toEqual({
      workspace: null,
      kind: 'exact',
      path: 'auth/login',
    })
  })

  it('applies defaultWorkspace for qualifier-less patterns', () => {
    expect(parseSpecPattern('auth/login', { defaultWorkspace: 'default' })).toEqual({
      workspace: 'default',
      kind: 'exact',
      path: 'auth/login',
    })
    expect(parseSpecPattern('_global/*', { defaultWorkspace: 'default' })).toEqual({
      workspace: 'default',
      kind: 'prefix',
      path: '_global',
    })
  })

  it('rejects a misplaced *', () => {
    expect(() => parseSpecPattern('core:te*am')).toThrow(InvalidSpecPatternError)
    expect(() => parseSpecPattern('a*b')).toThrow(InvalidSpecPatternError)
    expect(() => parseSpecPattern('team/*/x')).toThrow(InvalidSpecPatternError)
  })

  it('rejects a one-letter workspace qualifier', () => {
    expect(() => parseSpecPattern('a:*')).toThrow(InvalidSpecPatternError)
    try {
      parseSpecPattern('a:*')
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidSpecPatternError)
      expect((err as InvalidSpecPatternError).message).toContain("Invalid spec pattern 'a:*'")
      expect((err as InvalidSpecPatternError).message).toContain("workspace 'a' is invalid")
    }
  })

  it('rejects an uppercase segment', () => {
    expect(() => parseSpecPattern('core:Login')).toThrow(InvalidSpecPatternError)
    expect(() => parseSpecPattern('Auth/*')).toThrow(InvalidSpecPatternError)
  })

  it('raises InvalidSpecPatternError with code INVALID_SPEC_PATTERN for a programmatic a*b', () => {
    let err: unknown
    try {
      parseSpecPattern('a*b')
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(InvalidSpecPatternError)
    expect((err as InvalidSpecPatternError).code).toBe('INVALID_SPEC_PATTERN')
    expect((err as InvalidSpecPatternError).pattern).toBe('a*b')
  })

  it('is wrapped into ConfigValidationError by validateContextPattern', () => {
    expect(() => validateContextPattern('a*b', 'contextIncludeSpecs', '/cfg/specd.yaml')).toThrow(
      ConfigValidationError,
    )
  })
})
