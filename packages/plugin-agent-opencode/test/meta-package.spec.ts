import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('@specd/specd meta package', () => {
  it('given the meta package manifest, when its dependencies are inspected, then @specd/plugin-agent-opencode is a workspace dependency', () => {
    const manifestPath = join(dirname(fileURLToPath(import.meta.url)), '../../specd/package.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      dependencies: Record<string, string>
    }
    expect(manifest.dependencies['@specd/plugin-agent-opencode']).toBe('workspace:*')
  })
})
