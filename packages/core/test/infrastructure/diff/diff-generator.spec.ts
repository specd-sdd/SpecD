import { afterEach, describe, expect, it, vi } from 'vitest'
import { DiffDiffGenerator } from '../../../src/infrastructure/diff/diff-generator.js'

describe('DiffDiffGenerator', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

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

  it('raises DiffGenerationError when the diff library throws', async () => {
    vi.doMock('diff', () => ({
      createTwoFilesPatch: () => {
        throw new Error('library failed')
      },
    }))

    const { DiffDiffGenerator: MockedDiffGenerator } =
      await import('../../../src/infrastructure/diff/diff-generator.js')

    const generator = new MockedDiffGenerator()

    expect(() =>
      generator.generate({
        filename: 'spec.md',
        base: '# Old\n',
        merged: '# New\n',
      }),
    ).toThrowError(/Failed to generate diff/)

    try {
      generator.generate({
        filename: 'spec.md',
        base: '# Old\n',
        merged: '# New\n',
      })
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).name).toBe('DiffGenerationError')
    }
  })

  it('raises DiffGenerationError when the diff library returns unusable output', async () => {
    vi.doMock('diff', () => ({
      createTwoFilesPatch: () => '   ',
    }))

    const { DiffDiffGenerator: MockedDiffGenerator } =
      await import('../../../src/infrastructure/diff/diff-generator.js')

    const generator = new MockedDiffGenerator()

    expect(() =>
      generator.generate({
        filename: 'spec.md',
        base: '# Old\n',
        merged: '# New\n',
      }),
    ).toThrowError(/unusable output/)

    try {
      generator.generate({
        filename: 'spec.md',
        base: '# Old\n',
        merged: '# New\n',
      })
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).name).toBe('DiffGenerationError')
    }
  })
})
