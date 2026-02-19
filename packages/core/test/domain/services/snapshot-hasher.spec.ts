import { describe, it, expect } from 'vitest'
import { hashFiles } from '../../../src/domain/services/snapshot-hasher.js'

describe('hashFiles', () => {
  it('returns empty object for empty input', () => {
    expect(hashFiles({})).toEqual({})
  })

  it('hashes a single file', () => {
    const result = hashFiles({ 'proposal.md': 'some content' })
    expect(Object.keys(result)).toEqual(['proposal.md'])
    expect(result['proposal.md']).toMatch(/^sha256:[a-f0-9]{64}$/)
  })

  it('hashes multiple files', () => {
    const result = hashFiles({
      'proposal.md': 'proposal content',
      'design.md': 'design content',
    })
    expect(Object.keys(result)).toHaveLength(2)
    expect(result['proposal.md']).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(result['design.md']).toMatch(/^sha256:[a-f0-9]{64}$/)
  })

  it('produces the same hash for identical content', () => {
    const a = hashFiles({ 'file.md': 'same content' })
    const b = hashFiles({ 'file.md': 'same content' })
    expect(a['file.md']).toBe(b['file.md'])
  })

  it('produces different hashes for different content', () => {
    const result = hashFiles({
      'a.md': 'content a',
      'b.md': 'content b',
    })
    expect(result['a.md']).not.toBe(result['b.md'])
  })

  it('produces different hashes for content that differs only in whitespace', () => {
    const result = hashFiles({
      'a.md': 'content',
      'b.md': 'content ',
    })
    expect(result['a.md']).not.toBe(result['b.md'])
  })

  it('preserves the path as key', () => {
    const result = hashFiles({ 'specd/changes/foo/proposal.md': 'content' })
    expect(result).toHaveProperty('specd/changes/foo/proposal.md')
  })

  it('hashes empty file content', () => {
    const result = hashFiles({ 'empty.md': '' })
    expect(result['empty.md']).toMatch(/^sha256:[a-f0-9]{64}$/)
  })
})
