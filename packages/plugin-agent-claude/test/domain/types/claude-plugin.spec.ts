import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
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
    expect(plugin).not.toHaveProperty('type')
  })

  it('given an install context, when install and uninstall run, then they forward config and options', async () => {
    const runInstall = vi.fn(async () => ({ installed: [], skipped: [] }))
    const runUninstall = vi.fn(async () => {})
    const plugin = new ClaudeAgentPlugin(
      '@specd/plugin-agent-claude',
      '0.0.1',
      runInstall,
      runUninstall,
    )
    const config = { projectRoot: '/tmp' } as never
    const options = { skills: ['specd'] }
    await plugin.install({ config, contributions: ['claude'], options })
    await plugin.uninstall({ config, contributions: ['claude'], options })
    expect(runInstall).toHaveBeenCalledWith(config, options)
    expect(runUninstall).toHaveBeenCalledWith(config, options)
  })

  it('given the package manifest, when read, then it is schema version 2 with an agents contribution', () => {
    const manifestPath = join(dirname(fileURLToPath(import.meta.url)), '../../../specd-plugin.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      schemaVersion: number
      pluginType?: string
      contributes: { agents: Record<string, unknown> }
    }
    expect(manifest.schemaVersion).toBe(2)
    expect(manifest.pluginType).toBeUndefined()
    expect(manifest.contributes.agents).toHaveProperty('claude')
  })
})
