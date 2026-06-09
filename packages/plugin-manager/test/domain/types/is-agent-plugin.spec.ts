import { describe, expect, it } from 'vitest'
import type { SpecdConfig } from '@specd/core'
import { isAgentPlugin } from '../../../src/index.js'
import type { SpecdPlugin } from '../../../src/index.js'
import type { AgentInstallOptions } from '../../../src/index.js'

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

  it('given recursive variables and capabilities in install options, when install is typed, then the type guard remains valid', () => {
    const installOptions: AgentInstallOptions = {
      variables: {
        sharedFolder: '.specd/config/skills/shared',
        frontmatter: {
          name: 'specd',
          metadata: { owner: 'specd' },
        },
      },
      capabilities: ['mcp', 'frontmatter'],
    }

    const plugin = makeSpecdPlugin({
      install: async (_config: SpecdConfig, options?: AgentInstallOptions) => {
        expect(options).toEqual(installOptions)
        return { installed: [], skipped: [] }
      },
      uninstall: async () => {},
    })

    expect(isAgentPlugin(plugin)).toBe(true)
  })
})
