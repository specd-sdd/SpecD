import { describe, expect, it } from 'vitest'
import { isAgentPlugin } from '../../../src/index.js'
import type { SpecdPlugin } from '../../../src/index.js'

function makeSpecdPlugin(overrides: Record<string, unknown> = {}): SpecdPlugin {
  return {
    name: 'test-plugin',
    type: 'agent',
    version: '1.0.0',
    configSchema: {},
    init: async () => {},
    destroy: async () => {},
    ...overrides,
  } as SpecdPlugin
}

describe('isAgentPlugin', () => {
  it('given a valid AgentPlugin, when checked, then returns true', () => {
    const plugin = makeSpecdPlugin({
      install: async () => ({ installed: [], skipped: [] }),
      uninstall: async () => {},
    })
    expect(isAgentPlugin(plugin)).toBe(true)
  })

  it('given a SpecdPlugin without install method, when checked, then returns false', () => {
    const plugin = makeSpecdPlugin({
      uninstall: async () => {},
    })
    expect(isAgentPlugin(plugin)).toBe(false)
  })

  it('given a SpecdPlugin with wrong type, when checked, then returns false', () => {
    const plugin = makeSpecdPlugin({
      type: 'integration',
      install: async () => ({ installed: [], skipped: [] }),
      uninstall: async () => {},
    })
    expect(isAgentPlugin(plugin)).toBe(false)
  })
})
