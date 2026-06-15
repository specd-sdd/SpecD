import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const packageRoot = path.resolve(testDir, '..', '..')
const sharedSourcePath = path.join(packageRoot, '../code-graph/src/index.ts')

function collectExportNames(source: string): string[] {
  const names = new Set<string>()
  const matches = source.matchAll(/\bexport\s+(?:type\s+)?\{([^}]+)\}/g)

  for (const match of matches) {
    const block = match[1] ?? ''
    for (const rawPart of block.split(',')) {
      const part = rawPart.replace(/\btype\b/g, '').trim()
      if (part.length === 0) continue
      const [left] = part.split(/\s+as\s+/)
      const name = left?.trim()
      if (name) names.add(name)
    }
  }

  return [...names].sort()
}

describe('@specd/code-graph-electron', () => {
  it('stays internal-only and keeps sqlite vendored under the Electron package root', async () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
    ) as {
      private: boolean
      dependencies: Record<string, string>
    }

    expect(packageJson.private).toBe(true)
    expect(packageJson.dependencies['better-sqlite3']).toMatch(/^\^12\.8\.0$/)
    expect(existsSync(path.join(packageRoot, 'vendor/better-sqlite3/package.json'))).toBe(true)
  })

  it('builds the same top-level graph surface desktop expects', async () => {
    const builtDts = readFileSync(path.join(packageRoot, 'dist/index.d.ts'), 'utf8')
    const builtJs = readFileSync(path.join(packageRoot, 'dist/index.js'), 'utf8')
    const sharedSource = readFileSync(sharedSourcePath, 'utf8')

    for (const exportName of collectExportNames(sharedSource)) {
      expect(builtDts).toContain(exportName)
    }
    expect(builtDts).toContain('createCodeGraphProvider')
    expect(builtDts).toContain('vendoredSqliteBinaryPath')

    expect(builtJs).toContain('vendoredSqliteEntry')
    expect(builtJs).toContain('vendor/better-sqlite3')
  })
})
