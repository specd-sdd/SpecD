import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')

/**
 * specs/sdk/composition/verify.md
 */
describe('sdk:composition verification', () => {
  it('Scenario: SDK depends only on core and code-graph', () => {
    const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
    }
    const specdDeps = Object.keys(packageJson.dependencies ?? {}).filter((name) =>
      name.startsWith('@specd/'),
    )
    expect(specdDeps.sort()).toEqual(['@specd/code-graph', '@specd/core'])
    expect(specdDeps).not.toContain('@specd/cli')
    expect(specdDeps).not.toContain('@specd/mcp')
  })
})
