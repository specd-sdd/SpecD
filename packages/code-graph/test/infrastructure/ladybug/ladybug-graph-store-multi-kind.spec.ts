import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { LadybugGraphStore } from '../../../src/infrastructure/ladybug/ladybug-graph-store.js'
import { createFileNode } from '../../../src/domain/value-objects/file-node.js'
import { createSymbolNode } from '../../../src/domain/value-objects/symbol-node.js'
import { SymbolKind } from '../../../src/domain/value-objects/symbol-kind.js'

describe('LadybugGraphStore searchSymbols multi-kind', () => {
  let tempDir: string | undefined

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true })
      tempDir = undefined
    }
  })

  it('matches any of the requested symbol kinds', { timeout: 10000 }, async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-test-'))
    const store = new LadybugGraphStore(tempDir)
    await store.open()

    const file = createFileNode({
      path: 'ws:src/main.ts',
      language: 'typescript',
      contentHash: 'sha256:abc',
      workspace: 'ws',
    })
    const fn = createSymbolNode({
      name: 'createThing',
      kind: SymbolKind.Function,
      filePath: 'ws:src/main.ts',
      line: 1,
      column: 0,
      comment: 'create thing',
    })
    const cls = createSymbolNode({
      name: 'ThingBuilder',
      kind: SymbolKind.Class,
      filePath: 'ws:src/main.ts',
      line: 5,
      column: 0,
      comment: 'create thing',
    })
    const variable = createSymbolNode({
      name: 'thingState',
      kind: SymbolKind.Variable,
      filePath: 'ws:src/main.ts',
      line: 10,
      column: 0,
      comment: 'create thing',
    })

    await store.upsertFile(file, [fn, cls, variable], [])
    await store.rebuildFtsIndexes()

    const result = await store.searchSymbols({
      query: 'create',
      kinds: [SymbolKind.Function, SymbolKind.Class],
    })

    expect(result.map(({ symbol }) => symbol.kind).sort()).toEqual(['class', 'function'])
    await store.close()
  })
})
