import { describe, expect, it } from 'vitest'
import { DiffDiffGenerator } from '../../../src/infrastructure/diff/diff-generator.js'

describe('DiffDiffGenerator', () => {
  it('returns plain unified diff text with default labels', () => {
    const generator = new DiffDiffGenerator()

    const diff = generator.generate({
      filename: 'spec.md',
      base: '# Old\n',
      merged: '# New\n',
    })

    expect(diff).toContain('--- a/spec.md (base)')
    expect(diff).toContain('+++ b/spec.md (merged)')
    expect(diff).toContain('-# Old')
    expect(diff).toContain('+# New')
    expect(diff).not.toMatch(/\u001B\[/u)
  })

  it('accepts an empty base for newly introduced files', () => {
    const generator = new DiffDiffGenerator()

    const diff = generator.generate({
      filename: 'verify.md',
      base: '',
      merged: '# Added\n',
    })

    expect(diff).toContain('--- a/verify.md (base)')
    expect(diff).toContain('+++ b/verify.md (merged)')
    expect(diff).toContain('+# Added')
  })
})
