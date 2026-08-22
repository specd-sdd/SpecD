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
    'keeps the host event loop responsive across many chunked staging RPCs',
    { timeout: 60000 },
    async () => {
      tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-responsiveness-'))
      const store = new SQLiteGraphStore(tempDir)
      await store.open()

      // Build a large batch of files and symbols to force many staging RPCs
      const fileCount = 10000
      const files = Array.from({ length: fileCount }, (_, i) =>
        createFileNode({
          path: `core:src/module-${i}.ts`,
          configRelativePath: `src/module-${i}.ts`,
          language: 'typescript',
          contentHash: `sha256:hash-${i}`,
          workspace: 'core',
          content: `export function fn${i}() { return ${i} }`,
        }),
      )
      const symbols = Array.from({ length: fileCount }, (_, i) =>
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

      let ticks = 0
      const intervalMs = 10

      const timer = setInterval(() => {
        ticks++
      }, intervalMs)

      try {
        const stagingStart = performance.now()
        const session = store.beginBulkIndexSession({
          rebuildSearchIndexes: true,
        })
        const chunkSize = 250
        for (let i = 0; i < fileCount; i += chunkSize) {
          await session.writeFiles(files.slice(i, i + chunkSize))
          await session.writeSymbols(symbols.slice(i, i + chunkSize))
        }
        await session.commit()

        // The heartbeat must have fired during persistence. Requiring a small
        // fraction of elapsed/interval ticks stays diagnostic for event-loop
        // blocking while tolerating slow or bursty CI runners.
        const elapsedMs = performance.now() - stagingStart
        expect(ticks).toBeGreaterThan(0)
        expect(ticks).toBeGreaterThanOrEqual(Math.floor(elapsedMs / intervalMs / 4))

        const stats = await store.getStatistics()
        expect(stats.fileCount).toBe(fileCount)
        expect(stats.symbolCount).toBe(fileCount)
      } finally {
        clearInterval(timer)
        await store.close()
      }
    },
  )
})
