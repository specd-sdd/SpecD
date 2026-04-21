import { describe, expect, it } from 'vitest'
import { ClaudeAgentPlugin } from '../../../src/domain/types/claude-plugin.js'

describe('ClaudeAgentPlugin', () => {
  it('given constructor with name and version, returns correct metadata', () => {
    const plugin = new ClaudeAgentPlugin(
      '@specd/plugin-agent-claude',
      '0.0.1',
      async () => ({ installed: [], skipped: [] }),
      async () => {},
    )

    expect(plugin.name).toBe('@specd/plugin-agent-claude')
    expect(plugin.version).toBe('0.0.1')
    expect(plugin.type).toBe('agent')
  })
})
