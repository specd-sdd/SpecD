import { describe, expect, it } from 'vitest'
import { parseSpecLock, specLockSchema } from '../../../src/domain/services/parse-spec-lock.js'

describe('parseSpecLock', () => {
  it('parses valid spec-lock content', () => {
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

  it('throws on invalid JSON', () => {
    expect(() => parseSpecLock('{{bad')).toThrow()
  })

  it('throws on invalid dependsOn entries', () => {
    expect(() =>
      parseSpecLock(
        JSON.stringify({
          schema: { name: 'schema-std', version: 1 },
          dependsOn: ['not valid'],
        }),
      ),
    ).toThrow()
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
})
