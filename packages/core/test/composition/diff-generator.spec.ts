import { describe, expect, it } from 'vitest'
import { createDefaultDiffGenerator } from '../../src/composition/diff-generator.js'
import { DiffDiffGenerator } from '../../src/infrastructure/diff/diff-generator.js'

describe('createDefaultDiffGenerator', () => {
  it('returns the default diff generator implementation', () => {
    expect(createDefaultDiffGenerator()).toBeInstanceOf(DiffDiffGenerator)
  })
})
