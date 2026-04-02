import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, readdirSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createCodeGraphProvider } from '../../src/composition/create-code-graph-provider.js'
import { SymbolKind } from '../../src/domain/value-objects/symbol-kind.js'
import { StoreNotOpenError } from '../../src/domain/errors/store-not-open-error.js'

describe('CodeGraphProvider', () => {
  let tempDir: string

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('creates a working provider via factory', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-e2e-'))
    const srcDir = join(tempDir, 'src')
    mkdirSync(srcDir, { recursive: true })

    writeFileSync(
      join(srcDir, 'greet.ts'),
      `export function greet(name: string): string { return "Hello " + name }`,
    )
    writeFileSync(
      join(srcDir, 'main.ts'),
      `import { greet } from './greet.js'\nconst msg = greet('world')`,
    )

    const provider = createCodeGraphProvider({ storagePath: tempDir })
    await provider.open()

    const result = await provider.index({
      workspaces: [{ name: 'test', codeRoot: tempDir, specs: async () => [] }],
      projectRoot: tempDir,
    })
    expect(result.filesIndexed).toBeGreaterThanOrEqual(2)
    expect(result.errors).toHaveLength(0)

    const symbols = await provider.findSymbols({ kind: SymbolKind.Function })
    expect(symbols.length).toBeGreaterThanOrEqual(1)

    const stats = await provider.getStatistics()
    expect(stats.fileCount).toBeGreaterThanOrEqual(2)

    await provider.close()
  })

  it('throws StoreNotOpenError before open', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-e2e-'))
    const provider = createCodeGraphProvider({ storagePath: tempDir })
    await expect(provider.findSymbols({})).rejects.toThrow(StoreNotOpenError)
  })

  it('surfaces hierarchy-aware impact and hotspots through the provider', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-e2e-'))
    const srcDir = join(tempDir, 'src')
    mkdirSync(srcDir, { recursive: true })

    writeFileSync(
      join(srcDir, 'base.ts'),
      [
        'export interface Persistable {',
        '  save(): void',
        '}',
        '',
        'export class BaseService {',
        '  save(): void {}',
        '}',
      ].join('\n'),
    )
    writeFileSync(
      join(srcDir, 'user.ts'),
      [
        "import { Persistable, BaseService } from './base.js'",
        '',
        'export class UserService extends BaseService implements Persistable {',
        '  save(): void {}',
        '}',
      ].join('\n'),
    )

    const provider = createCodeGraphProvider({ storagePath: tempDir })
    await provider.open()

    const result = await provider.index({
      workspaces: [{ name: 'test', codeRoot: tempDir, specs: async () => [] }],
      projectRoot: tempDir,
    })
    expect(result.errors).toHaveLength(0)

    const contract = (await provider.findSymbols({ name: 'Persistable' })).find(
      (symbol) => symbol.filePath === 'test:src/base.ts',
    )
    expect(contract).toBeDefined()

    const impact = await provider.analyzeImpact(contract!.id, 'upstream')
    expect(impact.affectedFiles).toContain('test:src/user.ts')

    const hotspots = await provider.getHotspots({ minRisk: 'LOW', minScore: 0 })
    expect(hotspots.entries.some((entry) => entry.symbol.id === contract!.id)).toBe(true)

    await provider.close()
  })

  it('stages index artifacts under the store-owned tmp root and cleans them up', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-e2e-'))
    const srcDir = join(tempDir, 'src')
    mkdirSync(srcDir, { recursive: true })

    writeFileSync(join(srcDir, 'main.ts'), 'export const value = 1\n')

    const provider = createCodeGraphProvider({ storagePath: tempDir })
    await provider.open()

    await provider.index({
      workspaces: [{ name: 'test', codeRoot: tempDir, specs: async () => [] }],
      projectRoot: tempDir,
    })

    const tmpEntries = readdirSync(join(tempDir, 'tmp'), { withFileTypes: true })
    expect(
      tmpEntries.some((entry) => entry.isDirectory() && entry.name.startsWith('index-stage-')),
    ).toBe(false)

    await provider.close()
  })
})
