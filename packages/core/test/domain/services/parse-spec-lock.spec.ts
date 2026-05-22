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
})
