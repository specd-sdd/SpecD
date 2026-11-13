import { describe, expect, it, vi } from 'vitest'
import { SQLiteGraphStore } from '../../../src/infrastructure/sqlite/sqlite-graph-store.js'
import { SQLiteWorkerClient } from '../../../src/infrastructure/sqlite/sqlite-worker-client.js'
import { SymbolKind } from '../../../src/domain/value-objects/symbol-kind.js'
import { DeclarationOccurrenceForm } from '../../../src/domain/value-objects/symbol-reference.js'

describe('SQLite logical batch worker protocol', () => {
  it('uses one structured-clone-safe request per non-empty logical batch', async () => {
    const sendRequest = vi
      .spyOn(SQLiteWorkerClient.prototype, 'sendRequest')
      .mockResolvedValue([] as never)
    const store = new SQLiteGraphStore('/tmp/specd-logical-batch-protocol')

    await store.findDeclarations(['logical:a', 'logical:a', 'logical:b'])
    expect(sendRequest).toHaveBeenLastCalledWith('findDeclarations', {
      logicalSymbolIds: ['logical:a', 'logical:b'],
    })

    await store.findLogicalDeclarationsByDeclarationIds(['decl:b', 'decl:a', 'decl:b'])
    expect(sendRequest).toHaveBeenLastCalledWith('findLogicalDeclarationsByDeclarationIds', {
      declarationSymbolIds: ['decl:b', 'decl:a'],
    })

    await store.getCoveringSpecsForSymbols(['logical:b', 'logical:b', 'logical:a'])
    expect(sendRequest).toHaveBeenLastCalledWith('getCoveringSpecsForSymbols', {
      logicalSymbolIds: ['logical:b', 'logical:a'],
    })

    expect(sendRequest).toHaveBeenCalledTimes(3)
    for (const [, payload] of sendRequest.mock.calls) {
      expect(() => structuredClone(payload)).not.toThrow()
    }
    sendRequest.mockRestore()
  })

  it('does not contact the worker for empty logical batches', async () => {
    const sendRequest = vi
      .spyOn(SQLiteWorkerClient.prototype, 'sendRequest')
      .mockResolvedValue([] as never)
    const store = new SQLiteGraphStore('/tmp/specd-empty-logical-batch-protocol')

    await expect(store.findDeclarations([])).resolves.toEqual([])
    await expect(store.findLogicalDeclarationsByDeclarationIds([])).resolves.toEqual([])
    await expect(store.getCoveringSpecsForSymbols([])).resolves.toEqual([])
    expect(sendRequest).not.toHaveBeenCalled()
    sendRequest.mockRestore()
  })

  it('retains schema-15 occurrence form in the structured worker payload', async () => {
    const sendRequest = vi
      .spyOn(SQLiteWorkerClient.prototype, 'sendRequest')
      .mockResolvedValue(undefined as never)
    const store = new SQLiteGraphStore('/tmp/specd-occurrence-form-protocol')
    const declaration = {
      logicalSymbolId: 'logical:run',
      declaration: {
        logicalId: 'logical:run',
        symbolId: 'core:run.ts:function:run:1:0',
        location: { filePath: 'core:run.ts', line: 1, column: 0, endLine: 1, endColumn: 10 },
        kind: SymbolKind.Function,
        form: DeclarationOccurrenceForm.Signature,
        occurrenceForm: DeclarationOccurrenceForm.Signature,
      },
    }

    await store.replaceReferenceFacts({
      logicalSymbols: [],
      declarations: [declaration],
      publicBindings: [],
      localBindings: [],
      steps: [],
      coverage: [],
    })

    expect(sendRequest).toHaveBeenCalledOnce()
    expect(sendRequest).toHaveBeenCalledWith(
      'replaceReferenceFacts',
      expect.objectContaining({
        facts: expect.objectContaining({ declarations: [declaration] }),
      }),
    )
    expect(() => structuredClone(sendRequest.mock.calls[0]?.[1])).not.toThrow()
    sendRequest.mockRestore()
  })
})
