import { describe, it, expect } from 'vitest'
import { strictSpecMetadataSchema } from '../../../src/domain/services/parse-metadata.js'
import { parseMetadata } from '../../../src/application/use-cases/_shared/parse-metadata.js'

const VALID_HASH = 'sha256:' + 'a'.repeat(64)
const VALID_BASE = {
  title: 'Test',
  description: 'A test spec',
  contentHashes: { 'spec.md': VALID_HASH },
}

describe('parseMetadata (lenient read path)', () => {
  it('returns {} on invalid JSON', () => {
    expect(parseMetadata('{{{bad')).toEqual({})
  })

  it('returns {} on structurally invalid content', () => {
    expect(parseMetadata(JSON.stringify({ keywords: 123 }))).toEqual({})
  })

  it('parses valid metadata', () => {
    const json = JSON.stringify({
      title: 'Config',
      keywords: ['lifecycle'],
      dependsOn: ['core/storage'],
    })
    const result = parseMetadata(json)
    expect(result.title).toBe('Config')
    expect(result.keywords).toEqual(['lifecycle'])
    expect(result.dependsOn).toEqual(['core/storage'])
  })

  it('still accepts bare dependsOn entries', () => {
    const result = parseMetadata(
      JSON.stringify({
        title: 'Config',
        dependsOn: ['auth/login', ''],
      }),
    )
    expect(result.dependsOn).toEqual(['auth/login', ''])
  })
})

describe('strictSpecMetadataSchema', () => {
  it('rejects empty object (missing title and description)', () => {
    expect(strictSpecMetadataSchema.safeParse({}).success).toBe(false)
  })

  it('rejects missing title', () => {
    const result = strictSpecMetadataSchema.safeParse({ description: 'A desc' })
    expect(result.success).toBe(false)
  })

  it('rejects missing description', () => {
    const result = strictSpecMetadataSchema.safeParse({ title: 'T' })
    expect(result.success).toBe(false)
  })

  it('accepts valid complete metadata', () => {
    const result = strictSpecMetadataSchema.safeParse({
      ...VALID_BASE,
      keywords: ['lifecycle', 'approval'],
      dependsOn: ['core:storage', 'core:delta-format'],
      contentHashes: {
        'spec.md': 'sha256:' + 'a'.repeat(64),
      },
      rules: [{ requirement: 'Lifecycle', rules: ['A change must be open'] }],
      constraints: ['No self-reference'],
      scenarios: [
        {
          requirement: 'Lifecycle',
          name: 'Open cannot merge',
          when: ['merge is attempted'],
          then: ['error is returned'],
        },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('allows unknown top-level keys', () => {
    const result = strictSpecMetadataSchema.safeParse({ ...VALID_BASE, customField: 'value' })
    expect(result.success).toBe(true)
  })

  it('rejects empty title', () => {
    const result = strictSpecMetadataSchema.safeParse({ ...VALID_BASE, title: '' })
    expect(result.success).toBe(false)
  })

  it('rejects non-lowercase keywords', () => {
    const result = strictSpecMetadataSchema.safeParse({ ...VALID_BASE, keywords: ['Valid'] })
    expect(result.success).toBe(false)
  })

  it('rejects non-string keywords', () => {
    const result = strictSpecMetadataSchema.safeParse({ ...VALID_BASE, keywords: [123] })
    expect(result.success).toBe(false)
  })

  it('rejects invalid spec ID in dependsOn', () => {
    const result = strictSpecMetadataSchema.safeParse({
      ...VALID_BASE,
      dependsOn: ['not a valid id!'],
    })
    expect(result.success).toBe(false)
  })

  it('accepts workspace-qualified spec ID', () => {
    const result = strictSpecMetadataSchema.safeParse({
      ...VALID_BASE,
      dependsOn: ['billing:payments/invoices'],
    })
    expect(result.success).toBe(true)
  })

  it('rejects bare (unqualified) dependsOn entries', () => {
    const result = strictSpecMetadataSchema.safeParse({
      ...VALID_BASE,
      dependsOn: ['core/storage'],
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty dependsOn entries', () => {
    const result = strictSpecMetadataSchema.safeParse({
      ...VALID_BASE,
      dependsOn: [''],
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid contentHashes format', () => {
    const result = strictSpecMetadataSchema.safeParse({
      ...VALID_BASE,
      contentHashes: { 'spec.md': 'md5:abc' },
    })
    expect(result.success).toBe(false)
  })

  it('accepts valid sha256 hash', () => {
    const result = strictSpecMetadataSchema.safeParse({
      ...VALID_BASE,
      contentHashes: { 'spec.md': 'sha256:' + 'f'.repeat(64) },
    })
    expect(result.success).toBe(true)
  })

  it('rejects rules with empty requirement', () => {
    const result = strictSpecMetadataSchema.safeParse({
      ...VALID_BASE,
      rules: [{ requirement: '', rules: ['statement'] }],
    })
    expect(result.success).toBe(false)
  })

  it('rejects rules with empty rules array', () => {
    const result = strictSpecMetadataSchema.safeParse({
      ...VALID_BASE,
      rules: [{ requirement: 'Name', rules: [] }],
    })
    expect(result.success).toBe(false)
  })

  it('accepts scenarios missing when', () => {
    const result = strictSpecMetadataSchema.safeParse({
      ...VALID_BASE,
      scenarios: [{ requirement: 'X', name: 'Y', then: ['outcome'] }],
    })
    expect(result.success).toBe(true)
  })

  it('rejects scenarios missing then', () => {
    const result = strictSpecMetadataSchema.safeParse({
      ...VALID_BASE,
      scenarios: [{ requirement: 'X', name: 'Y', when: ['action'] }],
    })
    expect(result.success).toBe(false)
  })

  it('accepts scenarios with optional given', () => {
    const result = strictSpecMetadataSchema.safeParse({
      ...VALID_BASE,
      scenarios: [
        {
          requirement: 'X',
          name: 'Y',
          when: ['action'],
          then: ['outcome'],
        },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('rejects dependsOn with underscore-starting workspace', () => {
    const result = strictSpecMetadataSchema.safeParse({ ...VALID_BASE, dependsOn: ['_bad:path'] })
    expect(result.success).toBe(false)
  })

  it('accepts dependsOn with underscore-starting capability segment when qualified', () => {
    const result = strictSpecMetadataSchema.safeParse({
      ...VALID_BASE,
      dependsOn: ['default:_global/architecture'],
    })
    expect(result.success).toBe(true)
  })

  it('rejects bare implementation file specId', () => {
    const result = strictSpecMetadataSchema.safeParse({
      ...VALID_BASE,
      implementation: {
        files: [{ specId: '_global/architecture', file: 'core:src/foo.ts' }],
      },
    })
    expect(result.success).toBe(false)
  })
})

describe('strictSpecMetadataSchema field formats', () => {
  it('rejects keywords that are not lowercase-hyphen tokens', () => {
    for (const keyword of ['Upper', '1abc', 'has space', 'under_score']) {
      expect(
        strictSpecMetadataSchema.safeParse({ ...VALID_BASE, keywords: [keyword] }).success,
      ).toBe(false)
    }
    expect(
      strictSpecMetadataSchema.safeParse({ ...VALID_BASE, keywords: ['ok-keyword2'] }).success,
    ).toBe(true)
  })

  it('requires sha256 content hashes and at least one entry', () => {
    expect(strictSpecMetadataSchema.safeParse({ ...VALID_BASE, contentHashes: {} }).success).toBe(
      false,
    )
    expect(
      strictSpecMetadataSchema.safeParse({
        ...VALID_BASE,
        contentHashes: { 'spec.md': 'sha256:' + 'A'.repeat(64) },
      }).success,
    ).toBe(false)
  })

  it('treats scenarios as optional', () => {
    expect(strictSpecMetadataSchema.safeParse(VALID_BASE).success).toBe(true)
  })

  it('validates context entries as non-empty strings', () => {
    expect(strictSpecMetadataSchema.safeParse({ ...VALID_BASE, context: ['a'] }).success).toBe(true)
    expect(strictSpecMetadataSchema.safeParse({ ...VALID_BASE, context: [''] }).success).toBe(false)
  })

  it('accepts generatedBy core|agent and rejects other values', () => {
    expect(strictSpecMetadataSchema.safeParse({ ...VALID_BASE, generatedBy: 'core' }).success).toBe(
      true,
    )
    expect(
      strictSpecMetadataSchema.safeParse({ ...VALID_BASE, generatedBy: 'agent' }).success,
    ).toBe(true)
    expect(
      strictSpecMetadataSchema.safeParse({ ...VALID_BASE, generatedBy: 'human' }).success,
    ).toBe(false)
  })

  it('requires fully-qualified specIds in implementation entries', () => {
    expect(
      strictSpecMetadataSchema.safeParse({
        ...VALID_BASE,
        implementation: { files: [{ specId: 'auth/login', file: 'default:src/a.ts' }] },
      }).success,
    ).toBe(false)
    expect(
      strictSpecMetadataSchema.safeParse({
        ...VALID_BASE,
        implementation: {
          files: [{ specId: 'default:auth/login', file: 'default:src/a.ts' }],
          symbols: [{ specId: 'default:auth/login', file: 'default:src/a.ts', symbol: 'A' }],
        },
      }).success,
    ).toBe(true)
  })

  it('preserves unknown fields (passthrough)', () => {
    const parsed = strictSpecMetadataSchema.parse({ ...VALID_BASE, custom: 1 })
    expect((parsed as Record<string, unknown>).custom).toBe(1)
  })
})
