import { describe, expect, it } from 'vitest'
import { ZodError } from 'zod'
import { parseSpecLock, specLockSchema } from '../../../src/domain/services/parse-spec-lock.js'
import { InvalidSpecLockError } from '../../../src/domain/errors/invalid-spec-lock-error.js'

describe('parseSpecLock', () => {
  it('parses valid spec-lock content with qualified dependsOn', () => {
    const result = parseSpecLock(
      JSON.stringify({
        schema: { name: 'schema-std', version: 1 },
        dependsOn: ['core:storage', 'default:_global/architecture'],
      }),
    )

    expect(result).toEqual({
      schema: { name: 'schema-std', version: 1 },
      dependsOn: ['core:storage', 'default:_global/architecture'],
      implementation: [],
    })
  })

  it('throws InvalidSpecLockError on invalid JSON without a ZodError', () => {
    try {
      parseSpecLock('{{bad')
      expect.unreachable('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidSpecLockError)
      expect(err).not.toBeInstanceOf(ZodError)
      expect((err as InvalidSpecLockError).fieldPath).toBe('')
      expect((err as InvalidSpecLockError).message).toContain('is not valid JSON')
    }
  })

  it.each([
    [[''], 'dependsOn.0'],
    [['auth/login'], 'dependsOn.0'],
    [['not valid'], 'dependsOn.0'],
    [['core:'], 'dependsOn.0'],
  ])('rejects dependsOn %j as InvalidSpecLockError at %s', (dependsOn, fieldPath) => {
    try {
      parseSpecLock(
        JSON.stringify({
          schema: { name: 'schema-std', version: 1 },
          dependsOn,
        }),
        { specId: 'core:change', location: 'specs/core/change/spec-lock.json' },
      )
      expect.unreachable('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidSpecLockError)
      expect(err).not.toBeInstanceOf(ZodError)
      expect((err as InvalidSpecLockError).fieldPath).toBe(fieldPath)
      expect((err as InvalidSpecLockError).specId).toBe('core:change')
      expect((err as InvalidSpecLockError).location).toBe('specs/core/change/spec-lock.json')
      expect((err as InvalidSpecLockError).message).toContain(`field '${fieldPath}'`)
      expect((err as InvalidSpecLockError).rejectedValue).toBe(dependsOn[0])
      expect((err as InvalidSpecLockError).message).toContain(
        `value ${JSON.stringify(dependsOn[0])}`,
      )
    }
  })

  it('rejects a mix of valid and invalid dependsOn entries under strict read', () => {
    try {
      parseSpecLock(
        JSON.stringify({
          schema: { name: 'schema-std', version: 1 },
          dependsOn: ['core:storage', ''],
        }),
        { specId: 'core:change', location: 'specs/core/change/spec-lock.json' },
      )
      expect.unreachable('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidSpecLockError)
      expect((err as InvalidSpecLockError).fieldPath).toBe('dependsOn.1')
    }
  })

  it('tolerates invalid dependsOn entries when lenientDependsOn is true', () => {
    const result = parseSpecLock(
      JSON.stringify({
        schema: { name: 'schema-std', version: 1 },
        dependsOn: ['', 'auth/login', 'core:storage'],
      }),
      { specId: 'core:change', location: 'specs/core/change/spec-lock.json' },
      { lenientDependsOn: true },
    )

    expect(result.dependsOn).toEqual(['', 'auth/login', 'core:storage'])
    expect(result.schema).toEqual({ name: 'schema-std', version: 1 })
  })

  it('still rejects other invalid fields when lenientDependsOn is true', () => {
    try {
      parseSpecLock(
        JSON.stringify({
          schema: { name: '', version: 1 },
          dependsOn: [''],
        }),
        { specId: 'core:change', location: 'specs/core/change/spec-lock.json' },
        { lenientDependsOn: true },
      )
      expect.unreachable('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidSpecLockError)
      expect((err as InvalidSpecLockError).fieldPath).toBe('schema.name')
      expect((err as InvalidSpecLockError).rejectedValue).toBeUndefined()
    }
  })
})

describe('specLockSchema', () => {
  it('accepts originalHash when present', () => {
    const result = specLockSchema.safeParse({
      schema: { name: 'schema-std', version: 1 },
      dependsOn: ['core:storage'],
      implementation: [],
      originalHash: 'sha256:' + 'a'.repeat(64),
    })

    expect(result.success).toBe(true)
  })

  it('rejects negative schema version', () => {
    const result = specLockSchema.safeParse({
      schema: { name: 'schema-std', version: -1 },
      dependsOn: ['core:storage'],
      implementation: [],
    })

    expect(result.success).toBe(false)
  })

  it('parses locks without optimizations (backward compatible)', () => {
    const result = parseSpecLock(
      JSON.stringify({
        schema: { name: 'schema-std', version: 1 },
        dependsOn: ['core:storage'],
      }),
    )

    expect(result.optimizations).toBeUndefined()
  })

  it('parses locks with optimizations', () => {
    const hash = 'sha256:' + 'b'.repeat(64)
    const result = parseSpecLock(
      JSON.stringify({
        schema: { name: 'schema-std', version: 1 },
        dependsOn: [],
        implementation: [],
        optimizations: {
          optimizedDescription: {
            value: 'short',
            schema: { name: 'schema-std', version: 1 },
            artifactState: {
              'spec.md': { hash, lastModified: '2026-01-01T00:00:00.000Z' },
            },
          },
        },
      }),
    )

    expect(result.optimizations?.optimizedDescription?.value).toBe('short')
  })

  it('exposes code INVALID_SPEC_LOCK and a message that names spec, location and field path without repair advice', () => {
    try {
      parseSpecLock(
        JSON.stringify({ schema: { name: 'schema-std', version: 1 }, dependsOn: [''] }),
        { specId: 'core:change', location: 'specs/core/change/spec-lock.json' },
      )
      expect.unreachable('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidSpecLockError)
      const lockErr = err as InvalidSpecLockError
      expect(lockErr.code).toBe('INVALID_SPEC_LOCK')
      expect(lockErr.message).toContain("'core:change'")
      expect(lockErr.message).toContain('specs/core/change/spec-lock.json')
      expect(lockErr.message).toContain("field 'dependsOn.0'")
      expect(lockErr.message).not.toMatch(/repair|specd specs deps|--force/i)
    }
  })
})
