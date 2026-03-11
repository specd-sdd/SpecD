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
  it('returns {} on invalid YAML', () => {
    expect(parseMetadata('{{{bad')).toEqual({})
  })

  it('returns {} on structurally invalid content', () => {
    expect(parseMetadata('keywords: 123')).toEqual({})
  })

  it('parses valid metadata', () => {
    const yaml = `
title: Config
keywords:
  - lifecycle
dependsOn:
  - core/storage
`
    const result = parseMetadata(yaml)
    expect(result.title).toBe('Config')
    expect(result.keywords).toEqual(['lifecycle'])
    expect(result.dependsOn).toEqual(['core/storage'])
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
      dependsOn: ['core:storage', 'core/delta-format'],
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

  it('accepts unqualified capability path', () => {
    const result = strictSpecMetadataSchema.safeParse({
      ...VALID_BASE,
      dependsOn: ['core/storage'],
    })
    expect(result.success).toBe(true)
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

  it('accepts dependsOn with underscore-starting capability segment', () => {
    const result = strictSpecMetadataSchema.safeParse({
      ...VALID_BASE,
      dependsOn: ['_global/architecture'],
    })
    expect(result.success).toBe(true)
  })
})
