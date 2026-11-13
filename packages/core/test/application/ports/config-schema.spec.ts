import { describe, expect, it } from 'vitest'
import { validateContextPattern } from '../../../src/application/ports/config-schema.js'
import { ConfigValidationError } from '../../../src/domain/errors/config-validation-error.js'

describe('validateContextPattern', () => {
  it('accepts a leading-digit capability segment', () => {
    expect(() =>
      validateContextPattern('auth/2fa', 'contextIncludeSpecs', '/tmp/specd.yaml'),
    ).not.toThrow()
  })

  it('rejects a one-letter workspace qualifier', () => {
    expect(() => validateContextPattern('a:*', 'contextIncludeSpecs', '/tmp/specd.yaml')).toThrow(
      ConfigValidationError,
    )
  })

  it('rejects an uppercase Team prefix segment', () => {
    expect(() =>
      validateContextPattern('Team/*', 'contextIncludeSpecs', '/tmp/specd.yaml'),
    ).toThrow(ConfigValidationError)
  })
})
