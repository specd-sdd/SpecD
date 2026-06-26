import { describe, expect, it } from 'vitest'
import { makeMockConfig } from '../helpers.js'
import { getDeclaredPlugins } from '../../../src/commands/plugins/get-declared-plugins.js'

describe('getDeclaredPlugins', () => {
  it('given plugins.agents declared, when type agents, then returns entries', () => {
    const config = makeMockConfig({
      plugins: {
        agents: [{ name: '@specd/plugin-agent-claude' }],
      },
    })

    expect(getDeclaredPlugins(config, 'agents')).toEqual([{ name: '@specd/plugin-agent-claude' }])
  })

  it('given unknown type bucket, when queried, then returns empty list', () => {
    const config = makeMockConfig({
      plugins: {
        agents: [{ name: '@specd/plugin-agent-claude' }],
      },
    })

    expect(getDeclaredPlugins(config, 'missing')).toEqual([])
  })

  it('given plugins undefined, when queried, then returns empty list', () => {
    expect(getDeclaredPlugins(makeMockConfig(), 'agents')).toEqual([])
  })
})
