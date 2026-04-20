import { describe, expect, it } from 'vitest'
import { isSpecdPlugin } from '../../../src/index.js'

function makeBasePlugin(overrides: Record<string, unknown> = {}) {
  return {
    name: 'test-plugin',
    type: 'agent' as const,
    version: '1.0.0',
    configSchema: {},
    init: async () => {},
    destroy: async () => {},
    ...overrides,
  }
}

describe('isSpecdPlugin', () => {
  it('given a valid SpecdPlugin with known type, when checked, then returns true', () => {
    expect(isSpecdPlugin(makeBasePlugin())).toBe(true)
  })

  it('given a valid shape but unknown type, when checked, then returns false', () => {
    expect(isSpecdPlugin(makeBasePlugin({ type: 'unknown-type' }))).toBe(false)
  })

  it('given null, when checked, then returns false', () => {
    expect(isSpecdPlugin(null)).toBe(false)
  })

  it('given a non-object, when checked, then returns false', () => {
    expect(isSpecdPlugin('plugin')).toBe(false)
  })

  it('given an object missing name, when checked, then returns false', () => {
    const { name: _, ...rest } = makeBasePlugin()
    expect(isSpecdPlugin(rest)).toBe(false)
  })

  it('given an object missing init, when checked, then returns false', () => {
    const { init: _, ...rest } = makeBasePlugin()
    expect(isSpecdPlugin(rest)).toBe(false)
  })
})
