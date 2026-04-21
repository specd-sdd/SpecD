import { describe, expect, it } from 'vitest'
import { CopilotAgentPlugin } from '../../../src/domain/types/copilot-plugin.js'

describe('CopilotAgentPlugin', () => {
  it('given constructor with name and version, returns correct metadata', () => {
    const plugin = new CopilotAgentPlugin(
      '@specd/plugin-agent-copilot',
      '0.0.1',
      async () => ({ installed: [], skipped: [] }),
      async () => {},
    )

    expect(plugin.name).toBe('@specd/plugin-agent-copilot')
    expect(plugin.version).toBe('0.0.1')
    expect(plugin.type).toBe('agent')
  })
})
