import { describe, expect, it } from 'vitest'
import { OpenCodeAgentPlugin } from '../../../src/domain/types/opencode-plugin.js'

describe('OpenCodeAgentPlugin', () => {
  it('given constructor with name and version, returns correct metadata', () => {
    const plugin = new OpenCodeAgentPlugin(
      '@specd/plugin-agent-opencode',
      '0.0.1',
      async () => ({ installed: [], skipped: [] }),
      async () => {},
    )

    expect(plugin.name).toBe('@specd/plugin-agent-opencode')
    expect(plugin.version).toBe('0.0.1')
    expect(plugin.type).toBe('agent')
  })
})
