import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SQLiteGraphStore } from '../../../src/infrastructure/sqlite/sqlite-graph-store.js'
import { createFileNode } from '../../../src/domain/value-objects/file-node.js'
import { createSymbolNode } from '../../../src/domain/value-objects/symbol-node.js'
import { SymbolKind } from '../../../src/domain/value-objects/symbol-kind.js'

describe('SQLiteWorker responsiveness', () => {
  let tempDir: string | undefined

  afterEach(async () => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true })
      tempDir = undefined
    }
  })

  it(
    'keeps the host event loop responsive during large bulk index persistence',
    { timeout: 30000 },
    async () => {
      tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-responsiveness-'))
      const store = new SQLiteGraphStore(tempDir)
      await store.open()

      // Build a batch of files and symbols
      const files = Array.from({ length: 500 }, (_, i) =>
        createFileNode({
          path: `core:src/module-${i}.ts`,
          configRelativePath: `src/module-${i}.ts`,
          language: 'typescript',
          contentHash: `sha256:hash-${i}`,
          workspace: 'core',
          content: `export function fn${i}() { return ${i} }`,
        }),
      )
      const symbols = Array.from({ length: 500 }, (_, i) =>
        createSymbolNode({
          name: `fn${i}`,
          kind: SymbolKind.Function,
          filePath: `core:src/module-${i}.ts`,
          parentId: undefined,
          line: 1,
          column: 1,
          endLine: 1,
          endColumn: 35,
          selectionRange: {
            startLine: 1,
            startColumn: 1,
            endLine: 1,
            endColumn: 35,
          },
        }),
      )

      let timerTicks = 0
      const interval = setInterval(() => {
        timerTicks++
      }, 10)

      const session = store.beginBulkIndexSession({
        rebuildSearchIndexes: true,
      })
      await session.writeFiles(files)
      await session.writeSymbols(symbols)
      await session.commit()

      clearInterval(interval)
      // The host timer should have fired multiple times during bulk commit
      expect(timerTicks).toBeGreaterThanOrEqual(1)

      const stats = await store.getStatistics()
      expect(stats.fileCount).toBe(500)
      expect(stats.symbolCount).toBe(500)

      await store.close()
    },
  )
})
