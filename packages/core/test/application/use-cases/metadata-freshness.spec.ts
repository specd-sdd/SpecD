import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { checkMetadataFreshness } from '../../../src/application/use-cases/_shared/metadata-freshness.js'

function sha256(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}

describe('checkMetadataFreshness', () => {
  it('returns allFresh true when all hashes match', async () => {
    const content = '# Hello'
    const result = await checkMetadataFreshness({ 'spec.md': sha256(content) }, async (f) =>
      f === 'spec.md' ? content : null,
    )

    expect(result.allFresh).toBe(true)
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!.fresh).toBe(true)
    expect(result.entries[0]!.filename).toBe('spec.md')
  })

  it('returns allFresh true with multiple files all matching', async () => {
    const specContent = '# Spec'
    const verifyContent = '# Verify'
    const contents = new Map([
      ['spec.md', specContent],
      ['verify.md', verifyContent],
    ])

    const result = await checkMetadataFreshness(
      { 'spec.md': sha256(specContent), 'verify.md': sha256(verifyContent) },
      async (f) => contents.get(f) ?? null,
    )

    expect(result.allFresh).toBe(true)
    expect(result.entries).toHaveLength(2)
    expect(result.entries.every((e) => e.fresh)).toBe(true)
  })

  it('returns allFresh false when a hash does not match', async () => {
    const result = await checkMetadataFreshness(
      { 'spec.md': sha256('old content') },
      async () => 'new content',
    )

    expect(result.allFresh).toBe(false)
    expect(result.entries[0]!.fresh).toBe(false)
    expect(result.entries[0]!.recorded).toBe(sha256('old content'))
    expect(result.entries[0]!.current).toBe(sha256('new content'))
  })

  it('returns allFresh false when a recorded file is missing', async () => {
    const result = await checkMetadataFreshness({ 'spec.md': sha256('content') }, async () => null)

    expect(result.allFresh).toBe(false)
    expect(result.entries[0]!.fresh).toBe(false)
    expect(result.entries[0]!.current).toBe('')
  })

  it('returns allFresh false when contentHashes is undefined', async () => {
    const result = await checkMetadataFreshness(undefined, async () => 'content')

    expect(result.allFresh).toBe(false)
    expect(result.entries).toHaveLength(0)
  })

  it('returns allFresh false when contentHashes is empty', async () => {
    const result = await checkMetadataFreshness({}, async () => 'content')

    expect(result.allFresh).toBe(false)
    expect(result.entries).toHaveLength(0)
  })

  it('reports partial staleness correctly', async () => {
    const specContent = '# Spec'
    const contents = new Map([['spec.md', specContent]])

    const result = await checkMetadataFreshness(
      { 'spec.md': sha256(specContent), 'verify.md': sha256('old verify') },
      async (f) => contents.get(f) ?? null,
    )

    expect(result.allFresh).toBe(false)
    expect(result.entries).toHaveLength(2)

    const specEntry = result.entries.find((e) => e.filename === 'spec.md')!
    const verifyEntry = result.entries.find((e) => e.filename === 'verify.md')!
    expect(specEntry.fresh).toBe(true)
    expect(verifyEntry.fresh).toBe(false)
  })
})
