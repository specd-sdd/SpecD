import { describe, expect, it } from 'vitest'
import { isExcludedByPrefix } from '../../../src/application/services/is-excluded-by-prefix.js'

describe('isExcludedByPrefix', () => {
  it('matches an exact prefix and nested paths', () => {
    expect(isExcludedByPrefix('node_modules', ['node_modules'])).toBe(true)
    expect(isExcludedByPrefix('node_modules/pkg/index.js', ['node_modules'])).toBe(true)
    expect(isExcludedByPrefix('src/keep.ts', ['node_modules'])).toBe(false)
  })

  it('ignores trailing slashes on prefixes', () => {
    expect(isExcludedByPrefix('dist/out.js', ['dist/'])).toBe(true)
  })
})
