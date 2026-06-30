import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SDK_VERSION } from '@specd/sdk'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * specs/cli/entrypoint verify (change 12) — Host package SDK dependency boundary
 */
describe('@specd/mcp package boundary', () => {
  it('Scenario: MCP depends on SDK only', () => {
    const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
    }
    const specdDeps = Object.keys(packageJson.dependencies ?? {}).filter((name) =>
      name.startsWith('@specd/'),
    )
    expect(specdDeps).toEqual(['@specd/sdk'])
    expect(specdDeps).not.toContain('@specd/core')
  })

  it('Scenario: MCP can import the SDK public surface', () => {
    expect(typeof SDK_VERSION).toBe('string')
    expect(SDK_VERSION.length).toBeGreaterThan(0)
  })
})
