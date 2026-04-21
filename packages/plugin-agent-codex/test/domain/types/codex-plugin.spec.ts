import { describe, expect, it } from 'vitest'
import { CodexAgentPlugin } from '../../../src/domain/types/codex-plugin.js'

describe('CodexAgentPlugin', () => {
  it('given constructor with name and version, returns correct metadata', () => {
    const plugin = new CodexAgentPlugin(
      '@specd/plugin-agent-codex',
      '0.0.1',
      async () => ({ installed: [], skipped: [] }),
      async () => {},
    )

    expect(plugin.name).toBe('@specd/plugin-agent-codex')
    expect(plugin.version).toBe('0.0.1')
    expect(plugin.type).toBe('agent')
  })
})
