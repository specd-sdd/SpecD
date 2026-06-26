import { describe, expect, it } from 'vitest'
import * as core from '../../src/index.js'

const REMOVED_EXPORTS = [
  'InitProject',
  'AddPlugin',
  'RemovePlugin',
  'createInitProject',
  'createAddPlugin',
  'createRemovePlugin',
  'FsConfigWriter',
] as const

describe('@specd/core config mutation exports', () => {
  it('does not export removed use cases or per-operation factories', () => {
    for (const name of REMOVED_EXPORTS) {
      expect(name in core).toBe(false)
    }
    expect(typeof core.createConfigWriter).toBe('function')
  })
})
