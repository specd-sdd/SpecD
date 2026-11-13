import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
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
    expect(plugin).not.toHaveProperty('type')
  })

  it('given an install context, when install runs, then it forwards config and options', async () => {
    const runInstall = vi.fn(async () => ({ installed: [], skipped: [] }))
    const plugin = new CopilotAgentPlugin(
      '@specd/plugin-agent-copilot',
      '0.0.1',
      runInstall,
      async () => {},
    )
    const config = { projectRoot: '/tmp' } as never
    await plugin.install({ config, contributions: ['copilot'], options: { skills: ['specd'] } })
    expect(runInstall).toHaveBeenCalledWith(config, { skills: ['specd'] })
  })

  it('given the package manifest, when read, then it declares agents.copilot', () => {
    const manifest = JSON.parse(
      readFileSync(
        join(dirname(fileURLToPath(import.meta.url)), '../../../specd-plugin.json'),
        'utf8',
      ),
    ) as {
      schemaVersion: number
      pluginType?: string
      contributes: { agents: Record<string, unknown> }
    }
    expect(manifest.schemaVersion).toBe(2)
    expect(manifest.pluginType).toBeUndefined()
    expect(manifest.contributes.agents).toHaveProperty('copilot')
  })
})
