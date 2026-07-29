import { describe, expect, it } from 'vitest'
import { applyPersistedSpecStatePatch } from '../../../src/domain/services/apply-persisted-spec-state-patch.js'
import { PersistedSpecStateSchemaReplacementError } from '../../../src/domain/errors/persisted-spec-state-schema-replacement-error.js'

const SCHEMA = { name: 'schema-std', version: 1 } as const
const HASH = 'sha256:' + 'a'.repeat(64)

describe('applyPersistedSpecStatePatch', () => {
  it('creates initial state with defaults', () => {
    const result = applyPersistedSpecStatePatch(
      { kind: 'initial', schema: SCHEMA, dependsOn: ['core:storage'] },
      {},
    )

    expect(result).toEqual({
      schema: SCHEMA,
      dependsOn: ['core:storage'],
      implementation: [],
    })
  })

  it('applies patch on existing state', () => {
    const result = applyPersistedSpecStatePatch(
      {
        kind: 'existing',
        state: {
          schema: SCHEMA,
          dependsOn: ['core:storage'],
          implementation: [],
          originalHash: HASH,
        },
      },
      { dependsOn: ['core:change'] },
    )

    expect(result.dependsOn).toEqual(['core:change'])
    expect(result.schema).toEqual(SCHEMA)
  })

  it('preserves existing optimizations when the patch omits them', () => {
    const result = applyPersistedSpecStatePatch(
      {
        kind: 'existing',
        state: {
          schema: SCHEMA,
          dependsOn: [],
          implementation: [],
          optimizations: {
            optimizedDescription: {
              value: 'desc',
              schema: SCHEMA,
              artifactState: { 'spec.md': { hash: HASH, lastModified: 't1' } },
            },
          },
          originalHash: HASH,
        },
      },
      { implementation: [] },
    )

    expect(result.optimizations?.optimizedDescription?.value).toBe('desc')
  })

  it('strips empty optimizations from patch', () => {
    const result = applyPersistedSpecStatePatch(
      { kind: 'initial', schema: SCHEMA, dependsOn: [] },
      {
        optimizations: {
          optimizedDescription: {
            value: 'desc',
            schema: SCHEMA,
            artifactState: { 'spec.md': { hash: HASH, lastModified: '2026-01-01T00:00:00.000Z' } },
          },
        },
      },
    )

    expect(result.optimizations?.optimizedDescription?.value).toBe('desc')
  })

  it('removes existing optimizations when the patch sets null', () => {
    const result = applyPersistedSpecStatePatch(
      {
        kind: 'existing',
        state: {
          schema: SCHEMA,
          dependsOn: [],
          implementation: [],
          optimizations: {
            optimizedDescription: {
              value: 'desc',
              schema: SCHEMA,
              artifactState: { 'spec.md': { hash: HASH, lastModified: 't1' } },
            },
          },
          originalHash: HASH,
        },
      },
      { optimizations: null },
    )

    expect(result).not.toHaveProperty('optimizations')
  })

  it('rejects schema replacement on existing base', () => {
    expect(() =>
      applyPersistedSpecStatePatch(
        {
          kind: 'existing',
          state: {
            schema: SCHEMA,
            dependsOn: [],
            implementation: [],
            originalHash: HASH,
          },
        },
        { schema: { name: 'other', version: 2 } },
        { specId: 'core:storage' },
      ),
    ).toThrow(PersistedSpecStateSchemaReplacementError)
  })

  it('sorts optimization artifact state filename-ascending', () => {
    const result = applyPersistedSpecStatePatch(
      { kind: 'initial', schema: SCHEMA, dependsOn: [] },
      {
        optimizations: {
          optimizedContext: {
            value: 'ctx',
            schema: SCHEMA,
            artifactState: {
              'verify.md': { hash: HASH, lastModified: 't2' },
              'spec.md': { hash: HASH, lastModified: 't1' },
            },
          },
        },
      },
    )

    expect(Object.keys(result.optimizations!.optimizedContext!.artifactState)).toEqual([
      'spec.md',
      'verify.md',
    ])
  })
})
