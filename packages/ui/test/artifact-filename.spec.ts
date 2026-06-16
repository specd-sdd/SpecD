import { describe, expect, it } from 'vitest'
import { isMarkdownArtifactFilename } from '../src/lib/artifact-filename.js'

describe('isMarkdownArtifactFilename', () => {
  it('accepts markdown filenames', () => {
    expect(isMarkdownArtifactFilename('tasks.md')).toBe(true)
  })

  it('rejects missing filenames without throwing', () => {
    expect(isMarkdownArtifactFilename(undefined)).toBe(false)
  })
})
