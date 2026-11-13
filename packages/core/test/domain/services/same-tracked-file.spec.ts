import { describe, it, expect } from 'vitest'
import { sameTrackedFile } from '../../../src/domain/services/same-tracked-file.js'

describe('sameTrackedFile', () => {
  it('matches identical names on every platform', () => {
    for (const platform of ['win32', 'darwin', 'linux'] as const) {
      expect(sameTrackedFile('a/B.ts', 'a/B.ts', platform)).toBe(true)
    }
  })

  it('treats case-only differences as the same file on win32 and darwin', () => {
    expect(sameTrackedFile('Docs/Notes.md', 'docs/notes.md', 'win32')).toBe(true)
    expect(sameTrackedFile('Docs/Notes.md', 'docs/notes.md', 'darwin')).toBe(true)
  })

  it('keeps case-only differences distinct on a case-sensitive host', () => {
    expect(sameTrackedFile('Docs/Notes.md', 'docs/notes.md', 'linux')).toBe(false)
  })

  it('never treats different names as the same file', () => {
    expect(sameTrackedFile('a.ts', 'b.ts', 'win32')).toBe(false)
  })
})
