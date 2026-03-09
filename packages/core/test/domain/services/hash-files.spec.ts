import { describe, it, expect } from 'vitest'
import { hashFiles } from '../../../src/domain/services/hash-files.js'
import { NodeContentHasher } from '../../../src/infrastructure/node/content-hasher.js'

const hasher = new NodeContentHasher()
const hash = (c: string): string => hasher.hash(c)

describe('hashFiles', () => {
  it('returns empty object for empty input', () => {
    expect(hashFiles({}, hash)).toEqual({})
  })

  it('hashes a single file', () => {
    const result = hashFiles({ 'proposal.md': 'some content' }, hash)
    expect(Object.keys(result)).toEqual(['proposal.md'])
    expect(result['proposal.md']).toMatch(/^sha256:[a-f0-9]{64}$/)
  })

  it('hashes multiple files', () => {
    const result = hashFiles(
      {
        'proposal.md': 'proposal content',
        'design.md': 'design content',
      },
      hash,
    )
    expect(Object.keys(result)).toHaveLength(2)
    expect(result['proposal.md']).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(result['design.md']).toMatch(/^sha256:[a-f0-9]{64}$/)
  })

  it('produces the same hash for identical content', () => {
    const a = hashFiles({ 'file.md': 'same content' }, hash)
    const b = hashFiles({ 'file.md': 'same content' }, hash)
    expect(a['file.md']).toBe(b['file.md'])
  })

  it('produces different hashes for different content', () => {
    const result = hashFiles(
      {
        'a.md': 'content a',
        'b.md': 'content b',
      },
      hash,
    )
    expect(result['a.md']).not.toBe(result['b.md'])
  })

  it('produces different hashes for content that differs only in whitespace', () => {
    const result = hashFiles(
      {
        'a.md': 'content',
        'b.md': 'content ',
      },
      hash,
    )
    expect(result['a.md']).not.toBe(result['b.md'])
  })

  it('preserves the path as key', () => {
    const result = hashFiles({ 'specd/changes/foo/proposal.md': 'content' }, hash)
    expect(result).toHaveProperty('specd/changes/foo/proposal.md')
  })

  it('hashes empty file content', () => {
    const result = hashFiles({ 'empty.md': '' }, hash)
    expect(result['empty.md']).toMatch(/^sha256:[a-f0-9]{64}$/)
  })
})
