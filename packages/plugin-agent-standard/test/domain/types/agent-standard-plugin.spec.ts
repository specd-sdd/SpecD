import { describe, expect, it } from 'vitest'
import { AgentStandardAgentPlugin } from '../../../src/domain/types/agent-standard-plugin.js'

describe('AgentStandardAgentPlugin', () => {
  it('given constructor with name and version, returns correct metadata', () => {
    const plugin = new AgentStandardAgentPlugin(
      '@specd/plugin-agent-standard',
      '0.1.0',
      async () => ({ installed: [], skipped: [] }),
      async () => {},
    )

    expect(plugin.name).toBe('@specd/plugin-agent-standard')
    expect(plugin.version).toBe('0.1.0')
    expect(plugin.type).toBe('agent')
  })
})
