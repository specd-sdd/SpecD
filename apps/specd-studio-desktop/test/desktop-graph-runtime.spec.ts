import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(testDir, '..')
const repoRoot = path.resolve(desktopRoot, '../..')

describe('desktop graph runtime isolation', () => {
  it('keeps Electron rebuild wiring scoped to desktop while CLI and API stay on the standard package', () => {
    const desktopPackage = JSON.parse(
      readFileSync(path.join(desktopRoot, 'package.json'), 'utf8'),
    ) as {
      dependencies: Record<string, string>
      scripts: Record<string, string>
    }
    const apiPackage = JSON.parse(
      readFileSync(path.join(repoRoot, 'packages/api/package.json'), 'utf8'),
    ) as { dependencies: Record<string, string> }
    const cliPackage = JSON.parse(
      readFileSync(path.join(repoRoot, 'packages/cli/package.json'), 'utf8'),
    ) as { dependencies: Record<string, string> }

    expect(desktopPackage.dependencies['@specd/code-graph-sqlite-electron']).toBe('workspace:*')
    expect(desktopPackage.dependencies['@specd/code-graph-electron']).toBeUndefined()
    expect(desktopPackage.scripts['rebuild:graph-sqlite-electron']).toContain(
      '@specd/code-graph-sqlite-electron rebuild:vendored-sqlite-electron',
    )
    expect(desktopPackage.scripts['rebuild:graph-electron']).toBe(
      'pnpm rebuild:graph-sqlite-electron',
    )
    expect(desktopPackage.scripts.build).toContain('pnpm rebuild:graph-sqlite-electron &&')
    expect(desktopPackage.scripts.prestart).toBe('pnpm rebuild:graph-sqlite-electron')
    expect(desktopPackage.dependencies['@specd/sdk']).toBe('workspace:*')
    expect(apiPackage.dependencies['@specd/sdk']).toBe('workspace:*')
    expect(desktopPackage.dependencies['@specd/core']).toBeUndefined()
    expect(desktopPackage.dependencies['@specd/code-graph']).toBeUndefined()
    expect(apiPackage.dependencies['@specd/core']).toBeUndefined()
    expect(apiPackage.dependencies['@specd/code-graph']).toBeUndefined()
    expect(apiPackage.dependencies['@specd/code-graph-sqlite-electron']).toBeUndefined()
    expect(cliPackage.dependencies['@specd/code-graph-sqlite-electron']).toBeUndefined()
    expect(apiPackage.dependencies['@specd/code-graph-electron']).toBeUndefined()
    expect(cliPackage.dependencies['@specd/code-graph-electron']).toBeUndefined()
  })
})
