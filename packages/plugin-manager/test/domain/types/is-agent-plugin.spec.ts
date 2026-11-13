import { describe, expect, it } from 'vitest'
import type { SpecdConfig } from '@specd/core'
import { isAgentPlugin } from '../../../src/index.js'
import type { SpecdPlugin } from '../../../src/index.js'
import type { AgentInstallOptions } from '../../../src/index.js'

function makeSpecdPlugin(overrides: Record<string, unknown> = {}): SpecdPlugin {
  return {
    name: '@acme/test-plugin',
    version: '1.0.0',
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

  it('given a SpecdPlugin with install but no uninstall, when checked, then returns false', () => {
    const plugin = makeSpecdPlugin({
      install: async () => ({ installed: [], skipped: [] }),
    })
    expect(isAgentPlugin(plugin)).toBe(false)
  })

  it('given install and uninstall functions, when type is absent, then returns true', () => {
    const plugin = makeSpecdPlugin({
      install: async () => ({ installed: [], skipped: [] }),
      uninstall: async () => {},
    })
    expect(isAgentPlugin(plugin)).toBe(true)
  })

  it('given recursive variables and capabilities in install options, when install is called with the context, then the options reach the hook unchanged', async () => {
    const options: AgentInstallOptions = {
      variables: {
        sharedFolder: '.specd/config/skills/shared',
        frontmatter: {
          name: 'specd',
          metadata: { owner: 'specd' },
        },
      },
      capabilities: ['mcp', 'frontmatter'],
    }
    const received: unknown[] = []
    const plugin = makeSpecdPlugin({
      install: async (context: { options?: AgentInstallOptions }) => {
        received.push(context.options)
        return { installed: [], skipped: [] }
      },
      uninstall: async () => {},
    })

    expect(isAgentPlugin(plugin)).toBe(true)
    if (isAgentPlugin(plugin)) {
      await plugin.install({ config: {} as SpecdConfig, contributions: [], options })
    }
    expect(received).toEqual([options])
  })
})
