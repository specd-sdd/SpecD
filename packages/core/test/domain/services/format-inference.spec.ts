import { describe, it, expect } from 'vitest'
import { inferFormat } from '../../../src/domain/services/format-inference.js'

describe('inferFormat', () => {
  it('returns markdown for .md extension', () => {
    expect(inferFormat('spec.md')).toBe('markdown')
  })

  it('returns json for .json extension', () => {
    expect(inferFormat('data.json')).toBe('json')
  })

  it('returns yaml for .yaml extension', () => {
    expect(inferFormat('config.yaml')).toBe('yaml')
  })

  it('returns yaml for .yml extension', () => {
    expect(inferFormat('config.yml')).toBe('yaml')
  })

  it('returns plaintext for .txt extension', () => {
    expect(inferFormat('notes.txt')).toBe('plaintext')
  })

  it('returns undefined for unrecognised extension', () => {
    expect(inferFormat('image.png')).toBeUndefined()
  })

  it('returns undefined for extensionless filename', () => {
    expect(inferFormat('Makefile')).toBeUndefined()
  })

  it('uses the last dot segment as extension', () => {
    expect(inferFormat('my.spec.md')).toBe('markdown')
  })
})
