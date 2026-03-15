import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
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
})
