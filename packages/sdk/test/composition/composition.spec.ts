import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { isPluginName, type SdkContextOptions } from '../../src/index.js'

describe('sdk composition dependencies', () => {
  it('depends on core, code-graph, and plugin-manager', () => {
    const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')
    const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>
    }
    expect(Object.keys(packageJson.dependencies).sort()).toEqual([
      '@specd/code-graph',
      '@specd/core',
      '@specd/plugin-manager',
    ])
  })

  it('exports plugin name helpers and accepts plugin context options', () => {
    const options: SdkContextOptions = { plugins: false, pluginHandlers: [] }
    expect(options.plugins).toBe(false)
    expect(isPluginName('@specd/plugin-agent-claude')).toBe(true)
  })
})
