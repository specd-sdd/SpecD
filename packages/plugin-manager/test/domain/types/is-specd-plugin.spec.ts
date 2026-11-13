import { describe, expect, it } from 'vitest'
import { isSpecdPlugin } from '../../../src/index.js'

function makeBasePlugin(overrides: Record<string, unknown> = {}) {
  return {
    name: '@acme/test-plugin',
    version: '1.0.0',
    init: async () => {},
    destroy: async () => {},
    ...overrides,
  }
}

describe('isSpecdPlugin', () => {
  it('given a scoped plugin, when checked, then returns true', () => {
    expect(isSpecdPlugin(makeBasePlugin())).toBe(true)
  })

  it('given an unscoped name, when checked, then returns false', () => {
    expect(isSpecdPlugin(makeBasePlugin({ name: 'test-plugin' }))).toBe(false)
  })

  it('given a non-function install hook, when checked, then returns false', () => {
    expect(isSpecdPlugin(makeBasePlugin({ install: 'nope' }))).toBe(false)
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
