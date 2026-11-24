import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')

/**
 * specs/sdk/composition/verify.md
 */
describe('sdk:composition verification', () => {
  it('Scenario: SDK depends on core, code-graph, and plugin-manager', () => {
    const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
    }
    const specdDeps = Object.keys(packageJson.dependencies ?? {}).filter((name) =>
      name.startsWith('@specd/'),
    )
    expect(specdDeps.sort()).toEqual(['@specd/code-graph', '@specd/core', '@specd/plugin-manager'])
    expect(specdDeps).not.toContain('@specd/cli')
    expect(specdDeps).not.toContain('@specd/mcp')
  })

  it('plugin-manager does not depend on the sdk', () => {
    const managerJson = JSON.parse(
      readFileSync(join(packageRoot, '../plugin-manager/package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
    const names = [
      ...Object.keys(managerJson.dependencies ?? {}),
      ...Object.keys(managerJson.devDependencies ?? {}),
    ]
    expect(names).not.toContain('@specd/sdk')
  })

  it('plugin-manager may depend on core directly', () => {
    const managerJson = JSON.parse(
      readFileSync(join(packageRoot, '../plugin-manager/package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string> }
    expect(Object.keys(managerJson.dependencies ?? {})).toContain('@specd/core')
  })

  it('cli depends on the sdk and not on core or code-graph directly', () => {
    const cliJson = JSON.parse(readFileSync(join(packageRoot, '../cli/package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const names = [
      ...Object.keys(cliJson.dependencies ?? {}),
      ...Object.keys(cliJson.devDependencies ?? {}),
    ]
    expect(names).toContain('@specd/sdk')
    expect(names).not.toContain('@specd/core')
    expect(names).not.toContain('@specd/code-graph')
  })

  it('Scenario: SDK source tree keeps infrastructure out and domain narrow', () => {
    const src = join(packageRoot, 'src')
    expect(existsSync(join(src, 'infrastructure'))).toBe(false)
    const domain = join(src, 'domain')
    const entries = readdirSync(domain, { withFileTypes: true })
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name)
    expect(dirs).not.toContain('entities')
    expect(dirs).not.toContain('ports')
    expect(dirs).not.toContain('infrastructure')
    expect(dirs.sort()).toEqual(['errors'])
    for (const e of entries.filter((x) => x.isFile())) {
      expect(e.name).toMatch(/^(index|.*-error)\.ts$/)
    }
    for (const e of readdirSync(join(domain, 'errors'))) {
      expect(e).toMatch(/^(index|.*-error)\.ts$/)
    }
  })
})
