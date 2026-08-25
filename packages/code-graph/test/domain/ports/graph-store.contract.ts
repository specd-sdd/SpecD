import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { type GraphStore, type ReferenceFactsWrite } from '../../../src/domain/ports/graph-store.js'
import { createDocumentNode } from '../../../src/domain/value-objects/document-node.js'
import { createFileNode } from '../../../src/domain/value-objects/file-node.js'
import { createSymbolNode } from '../../../src/domain/value-objects/symbol-node.js'
import { createSpecNode } from '../../../src/domain/value-objects/spec-node.js'
import { createRelation } from '../../../src/domain/value-objects/relation.js'
import { SymbolKind } from '../../../src/domain/value-objects/symbol-kind.js'
import { RelationType } from '../../../src/domain/value-objects/relation-type.js'
import { StoreNotOpenError } from '../../../src/domain/errors/store-not-open-error.js'
import { InMemoryGraphStore } from '../../helpers/in-memory-graph-store.js'
import {
  createLocalBinding,
  createLogicalSymbol,
  createPublicBinding,
  MemberForm,
  SymbolSpace,
} from '../../../src/domain/value-objects/symbol-reference.js'
import { IndexCoverageStatus } from '../../../src/domain/value-objects/index-session.js'
import {
  IndexedInputKind,
  IndexedResourceKind,
} from '../../../src/domain/value-objects/indexed-input-freshness.js'
import { ResolveSymbolReference } from '../../../src/application/use-cases/resolve-symbol-reference.js'

export function graphStoreContractTests(
  name: string,
  createStore: () => GraphStore | Promise<GraphStore>,
  cleanup?: () => Promise<void>,
  options: { readonly supportsReferenceFacts?: boolean } = {},
): void {
  describe(`GraphStore contract: ${name}`, () => {
    let store: GraphStore

    it('throws StoreNotOpenError when not open', async () => {
      const closedStore = await createStore()
      try {
        await expect(closedStore.getAllFiles()).rejects.toThrow(StoreNotOpenError)
      } finally {
        try {
          await closedStore.close()
        } catch {
          // already closed
        }
        if (cleanup) await cleanup()
      }
    })

    describe('when open', () => {
      beforeEach(async () => {
        store = await createStore()
        await store.open()
      })

      afterEach(async () => {
        try {
          await store.close()
        } catch {
          // already closed
        }
        if (cleanup) await cleanup()
      })

      it('upserts and retrieves a file', async () => {
        const file = createFileNode({
          path: 'src/main.ts',
          configRelativePath: '',
          language: 'typescript',
          contentHash: 'sha256:abc',
          workspace: '/project',
        })
        await store.upsertFile(file, [], [])

        const retrieved = await store.getFile('src/main.ts')
        expect(retrieved).toBeDefined()
        expect(retrieved!.path).toBe('src/main.ts')
        expect(retrieved!.language).toBe('typescript')
      })

      it('upserts and retrieves a document', async () => {
        const document = createDocumentNode({
          path: 'root:docs/guide.md',
          configRelativePath: 'docs/guide.md',
          contentHash: 'sha256:doc',
          content: '# Guide\n\nHello graph',
          workspace: 'root',
        })

        await store.upsertDocument(document)

        const retrieved = await store.getDocument(document.path)
        expect(retrieved).toBeDefined()
        expect(retrieved!.configRelativePath).toBe('docs/guide.md')
      })

      it('persists freshness observations with guarded monotonic stale latches', async () => {
        const resource = {
          workspace: 'core',
          resourceKind: IndexedResourceKind.File,
          resourceId: 'core:src/main.ts',
        } as const
        const observation = {
          ...resource,
          inputKind: IndexedInputKind.Filesystem,
          inputLocator: 'src/main.ts',
          indexedContentHash: 'sha256:old',
          lastObservedMtime: 1,
          lastObservedSize: 10,
          generation: 'generation-1',
          stale: false,
        } as const
        await store.bulkLoad({
          files: [],
          symbols: [],
          specs: [],
          relations: [],
          observations: [observation],
          indexedWorkspaces: ['core'],
          clearGraphStaleLatch: true,
        })

        await store.markIndexedInputsStale([
          {
            ...resource,
            inputKind: observation.inputKind,
            inputLocator: observation.inputLocator,
            expectedIndexedContentHash: observation.indexedContentHash,
            expectedGeneration: 'wrong-generation',
          },
        ])
        expect((await store.getIndexedInputObservations([resource]))[0]?.stale).toBe(false)

        await store.markIndexedInputsStale([
          {
            ...resource,
            inputKind: observation.inputKind,
            inputLocator: observation.inputLocator,
            expectedIndexedContentHash: observation.indexedContentHash,
            expectedGeneration: observation.generation,
          },
        ])
        await store.markWorkspacesAndGraphStaleSinceLastIndex(['core'])
        expect((await store.getIndexedInputObservations([resource]))[0]?.stale).toBe(true)
        expect(await store.getFreshnessLatches(['core'])).toEqual({
          graph: true,
          workspaces: { core: true },
        })

        await store.bulkLoad({
          files: [],
          symbols: [],
          specs: [],
          relations: [],
          observations: [{ ...observation, generation: 'generation-2' }],
          indexedWorkspaces: ['core'],
          clearGraphStaleLatch: true,
        })
        expect(await store.getFreshnessLatches(['core'])).toEqual({
          graph: false,
          workspaces: { core: false },
        })
      })

      it('removeDocument removes document nodes', async () => {
        const document = createDocumentNode({
          path: 'root:docs/guide.md',
          configRelativePath: 'docs/guide.md',
          contentHash: 'sha256:doc',
          content: '# Guide\n\nHello graph',
          workspace: 'root',
        })

        await store.upsertDocument(document)
        await store.removeDocument(document.path)

        expect(await store.getDocument(document.path)).toBeUndefined()
      })

      it('upserts a file with symbols and relations', async () => {
        const file = createFileNode({
          path: 'src/main.ts',
          configRelativePath: '',
          language: 'typescript',
          contentHash: 'sha256:abc',
          workspace: '/project',
        })
        const symbol = createSymbolNode({
          name: 'main',
          kind: SymbolKind.Function,
          filePath: 'src/main.ts',
          line: 1,
          column: 0,
          endLine: 4,
          endColumn: 1,
          selectionRange: {
            startLine: 1,
            startColumn: 9,
            endLine: 1,
            endColumn: 13,
          },
        })
        const rel = createRelation({
          source: 'src/main.ts',
          target: symbol.id,
          type: RelationType.Defines,
        })

        await store.upsertFile(file, [symbol], [rel])

        const retrieved = await store.getSymbol(symbol.id)
        expect(retrieved).toBeDefined()
        expect(retrieved!.name).toBe('main')
        expect(retrieved).toMatchObject({
          line: 1,
          column: 0,
          endLine: 4,
          endColumn: 1,
          selectionRange: {
            startLine: 1,
            startColumn: 9,
            endLine: 1,
            endColumn: 13,
          },
        })

        const found = await store.findSymbols({ filePath: 'src/main.ts' })
        expect(found).toHaveLength(1)
        expect(found[0]?.selectionRange).toEqual(symbol.selectionRange)
      })

      it('round-trips symbol construct and selection ranges through bulk load', async () => {
        const file = createFileNode({
          path: 'core:src/ranged.ts',
          configRelativePath: 'src/ranged.ts',
          language: 'typescript',
          contentHash: 'sha256:ranged',
          workspace: 'core',
        })
        const symbol = createSymbolNode({
          name: 'RangedSymbol',
          kind: SymbolKind.Class,
          filePath: file.path,
          line: 3,
          column: 0,
          endLine: 9,
          endColumn: 1,
          selectionRange: {
            startLine: 3,
            startColumn: 6,
            endLine: 3,
            endColumn: 18,
          },
        })

        await store.bulkLoad({ files: [file], symbols: [symbol], specs: [], relations: [] })

        expect(await store.getSymbol(symbol.id)).toEqual(symbol)
      })

      it('batches symbols and traversal relations deterministically', async () => {
        const file = createFileNode({
          path: 'core:src/batch.ts',
          configRelativePath: 'src/batch.ts',
          language: 'typescript',
          contentHash: 'sha256:batch',
          workspace: 'core',
        })
        const symbols = Array.from({ length: 7 }, (_, index) =>
          createSymbolNode({
            name: `symbol${String(index)}`,
            kind: SymbolKind.Function,
            filePath: file.path,
            line: index + 1,
            column: 0,
          }),
        )
        const relationTypes = [
          RelationType.Calls,
          RelationType.Constructs,
          RelationType.UsesType,
          RelationType.Extends,
          RelationType.Implements,
          RelationType.Overrides,
        ] as const
        const relations = relationTypes.map((type, index) =>
          createRelation({ source: symbols[index + 1]!.id, target: symbols[0]!.id, type }),
        )

        await store.bulkLoad({ files: [file], symbols, specs: [], relations })

        expect(
          await store.getSymbolsByIds([
            symbols[2]!.id,
            'unknown-symbol',
            symbols[0]!.id,
            symbols[2]!.id,
          ]),
        ).toEqual([symbols[2], symbols[0]])
        expect(await store.getSymbolsByIds([])).toEqual([])

        const incoming = await store.getIncomingSymbolRelations(
          [symbols[0]!.id, symbols[0]!.id, 'unknown-symbol'],
          relationTypes,
        )
        expect(incoming).toEqual(
          [...relations].sort(
            (left, right) =>
              left.source.localeCompare(right.source) ||
              left.type.localeCompare(right.type) ||
              left.target.localeCompare(right.target),
          ),
        )

        const outgoing = await store.getOutgoingSymbolRelations(
          [symbols[3]!.id, symbols[1]!.id, symbols[3]!.id],
          relationTypes,
        )
        expect(outgoing).toEqual(
          relations
            .filter(
              (relation) =>
                relation.source === symbols[1]!.id || relation.source === symbols[3]!.id,
            )
            .sort(
              (left, right) =>
                left.source.localeCompare(right.source) ||
                left.type.localeCompare(right.type) ||
                left.target.localeCompare(right.target),
            ),
        )
        expect(await store.getIncomingSymbolRelations([], relationTypes)).toEqual([])
        expect(await store.getOutgoingSymbolRelations([symbols[0]!.id], [])).toEqual([])
      })

      it('batches files, documents, and specs deterministically by requested identity', async () => {
        const fileA = createFileNode({
          path: 'core:src/node-a.ts',
          configRelativePath: 'src/node-a.ts',
          language: 'typescript',
          contentHash: 'sha256:node-a',
          workspace: 'core',
        })
        const fileB = createFileNode({
          path: 'core:src/node-b.ts',
          configRelativePath: 'src/node-b.ts',
          language: 'typescript',
          contentHash: 'sha256:node-b',
          workspace: 'core',
        })
        const document = createDocumentNode({
          path: 'root:docs/batch.md',
          configRelativePath: 'docs/batch.md',
          contentHash: 'sha256:batch-doc',
          content: '# Batch',
          workspace: 'root',
        })
        const spec = createSpecNode({
          specId: 'core:core/batch',
          path: 'specs/core/batch',
          title: 'Batch',
          contentHash: 'sha256:batch-spec',
          workspace: 'test',
        })
        const otherSpec = createSpecNode({
          specId: 'core:core/batch-other',
          path: 'specs/core/batch-other',
          title: 'Batch Other',
          contentHash: 'sha256:batch-spec-other',
          workspace: 'test',
        })

        await store.bulkLoad({ files: [fileA, fileB], symbols: [], specs: [], relations: [] })
        await store.upsertDocument(document)
        await store.upsertSpec(spec, [])
        await store.upsertSpec(otherSpec, [])

        expect(
          await store.getFilesByPaths([
            fileB.path,
            'unknown-file',
            fileA.path,
            fileB.path,
            fileB.path,
          ]),
        ).toEqual([fileB, fileA])
        expect(
          await store.getDocumentsByPaths(['unknown-doc', document.path, document.path]),
        ).toEqual([document])
        expect(
          await store.getSpecsByIds([
            otherSpec.specId,
            'unknown-spec',
            spec.specId,
            otherSpec.specId,
          ]),
        ).toEqual([otherSpec, spec])

        expect(await store.getFilesByPaths([])).toEqual([])
        expect(await store.getDocumentsByPaths([])).toEqual([])
        expect(await store.getSpecsByIds([])).toEqual([])
      })

      it('stages bounded bulk-session chunks until one commit and deduplicates relations', async () => {
        const file = createFileNode({
          path: 'core:src/bulk.ts',
          configRelativePath: 'src/bulk.ts',
          language: 'typescript',
          contentHash: 'sha256:bulk',
          workspace: 'core',
          content: 'export function source() { target() }\nexport function target() {}',
        })
        const source = createSymbolNode({
          name: 'source',
          kind: SymbolKind.Function,
          filePath: file.path,
          line: 1,
          column: 7,
        })
        const target = createSymbolNode({
          name: 'target',
          kind: SymbolKind.Function,
          filePath: file.path,
          line: 2,
          column: 7,
        })
        const relation = createRelation({
          source: source.id,
          target: target.id,
          type: RelationType.Calls,
        })
        const progressSteps: string[] = []
        const session = store.beginBulkIndexSession({
          graphFingerprint: 'bulk-fingerprint',
          onProgress: (step) => progressSteps.push(step),
        })
        await session.writeFiles([file])
        await session.writeSymbols([source])
        await session.writeSymbols([target])
        await session.writeRelations([relation])
        await session.writeRelations([relation])

        expect(await store.getFile(file.path)).toBeUndefined()
        await session.commit()

        expect(await store.getFile(file.path)).toEqual(file)
        expect(await store.getCallees(source.id)).toEqual([
          expect.objectContaining({
            source: relation.source,
            target: relation.target,
            type: relation.type,
          }),
        ])
        expect((await store.getStatistics()).graphFingerprint).toBe('bulk-fingerprint')
        expect(progressSteps.filter((step) => step === 'search-indexes')).toHaveLength(1)
      })

      it('discards every staged bulk-session chunk on rollback', async () => {
        const file = createFileNode({
          path: 'core:src/rolled-back.ts',
          configRelativePath: 'src/rolled-back.ts',
          language: 'typescript',
          contentHash: 'sha256:rollback',
          workspace: 'core',
        })
        const session = store.beginBulkIndexSession()
        await session.writeFiles([file])
        await session.rollback()

        expect(await store.getFile(file.path)).toBeUndefined()
        await expect(session.commit()).rejects.toThrow('already finished')
      })

      it('returns deterministic filtered pages of source-content candidates', async () => {
        const files = (
          [
            ['core:src/a.ts', 'core'],
            ['core:src/b.ts', 'core'],
            ['excluded:src/c.ts', 'excluded'],
          ] as const
        ).map(([path, workspace]) =>
          createFileNode({
            path,
            configRelativePath: path.substring(path.indexOf(':') + 1),
            language: 'typescript',
            contentHash: `sha256:${path}`,
            workspace,
            content: 'const needle = true',
          }),
        )
        await store.bulkLoad({ files, symbols: [], specs: [], relations: [] })

        const firstPage = await store.searchSourceContentCandidates({
          normalizedQuery: 'needle',
          rawTerms: ['needle'],
          expandedTerms: [],
          excludeWorkspaces: ['excluded'],
          limit: 1,
        })
        expect(firstPage.candidates.map(({ file }) => file.path)).toEqual(['core:src/a.ts'])
        expect(firstPage.nextCursor).toBe('1')

        const secondPage = await store.searchSourceContentCandidates({
          normalizedQuery: 'needle',
          rawTerms: ['needle'],
          expandedTerms: [],
          excludeWorkspaces: ['excluded'],
          limit: 1,
          cursor: firstPage.nextCursor,
        })
        expect(secondPage.candidates.map(({ file }) => file.path)).toEqual(['core:src/b.ts'])
        expect(secondPage.nextCursor).toBeUndefined()
      })

      it('removeFile removes file, symbols, and relations', async () => {
        const file = createFileNode({
          path: 'src/main.ts',
          configRelativePath: '',
          language: 'typescript',
          contentHash: 'sha256:abc',
          workspace: '/project',
        })
        const symbol = createSymbolNode({
          name: 'main',
          kind: SymbolKind.Function,
          filePath: 'src/main.ts',
          line: 1,
          column: 0,
        })
        await store.upsertFile(
          file,
          [symbol],
          [
            createRelation({
              source: 'src/main.ts',
              target: symbol.id,
              type: RelationType.Defines,
            }),
          ],
        )

        await store.removeFile('src/main.ts')

        expect(await store.getFile('src/main.ts')).toBeUndefined()
        expect(await store.getSymbol(symbol.id)).toBeUndefined()
      })

      it('upsertFile replaces previous data atomically', async () => {
        const file = createFileNode({
          path: 'src/main.ts',
          configRelativePath: '',
          language: 'typescript',
          contentHash: 'sha256:v1',
          workspace: '/project',
        })
        const sym1 = createSymbolNode({
          name: 'old',
          kind: SymbolKind.Function,
          filePath: 'src/main.ts',
          line: 1,
          column: 0,
        })
        await store.upsertFile(file, [sym1], [])

        const fileV2 = createFileNode({
          path: 'src/main.ts',
          configRelativePath: '',
          language: 'typescript',
          contentHash: 'sha256:v2',
          workspace: '/project',
        })
        const sym2 = createSymbolNode({
          name: 'new',
          kind: SymbolKind.Function,
          filePath: 'src/main.ts',
          line: 5,
          column: 0,
        })
        await store.upsertFile(fileV2, [sym2], [])

        expect(await store.getSymbol(sym1.id)).toBeUndefined()
        expect(await store.getSymbol(sym2.id)).toBeDefined()

        const updatedFile = await store.getFile('src/main.ts')
        expect(updatedFile!.contentHash).toBe('sha256:v2')
      })

      const referenceFactsIt = options.supportsReferenceFacts ? it : it.skip
      referenceFactsIt('replaces and batch-queries reference facts deterministically', async () => {
        const primary = createLogicalSymbol({
          workspace: 'code-graph',
          surface: 'src/alpha.ts',
          name: 'Alpha',
          space: SymbolSpace.Value,
          ownerId: undefined,
          memberForm: undefined,
        })
        const member = createLogicalSymbol({
          workspace: 'code-graph',
          surface: 'src/alpha.ts',
          name: 'run',
          space: SymbolSpace.Value,
          ownerId: primary.id,
          memberForm: MemberForm.Instance,
        })
        const parallelBinding = createPublicBinding({
          surface: 'code-graph',
          exportedName: 'AlphaAlias',
          space: SymbolSpace.Value,
          targetId: primary.id,
        })
        const directBinding = createPublicBinding({
          surface: 'code-graph',
          exportedName: 'Alpha',
          space: SymbolSpace.Value,
          targetId: primary.id,
        })
        const alternateSurfaceBinding = createPublicBinding({
          surface: 'sdk',
          exportedName: 'Alpha',
          space: SymbolSpace.Value,
          targetId: primary.id,
        })
        const localBinding = createLocalBinding({
          filePath: 'code-graph:src/consumer.ts',
          scopeId: 'module',
          localName: 'Alias',
          space: SymbolSpace.Value,
          targetId: primary.id,
        })
        const facts: ReferenceFactsWrite = {
          logicalSymbols: [member, primary],
          declarations: [
            {
              logicalSymbolId: primary.id,
              declaration: {
                symbolId: 'code-graph:src/alpha.ts:class:Alpha:1:0',
                logicalId: primary.id,
                location: {
                  filePath: 'code-graph:src/alpha.ts',
                  line: 1,
                  column: 0,
                  endLine: 3,
                  endColumn: 1,
                },
                kind: SymbolKind.Class,
              },
            },
            {
              logicalSymbolId: primary.id,
              declaration: {
                symbolId: 'code-graph:src/alpha.ts:class:Alpha:10:0',
                logicalId: primary.id,
                location: {
                  filePath: 'code-graph:src/alpha.ts',
                  line: 10,
                  column: 0,
                  endLine: 12,
                  endColumn: 1,
                },
                kind: SymbolKind.Class,
              },
            },
          ],
          publicBindings: [parallelBinding, alternateSurfaceBinding, directBinding],
          localBindings: [localBinding],
          steps: [
            { fromId: parallelBinding.id, toId: primary.id, kind: 'reexport' },
            { fromId: directBinding.id, toId: primary.id, kind: 'export' },
          ],
          coverage: [
            {
              filePath: 'code-graph:src/consumer.ts',
              contentHash: 'sha256:consumer',
              status: IndexCoverageStatus.Indexed,
              reason: undefined,
              capabilities: ['public-bindings'],
            },
            {
              filePath: 'code-graph:src/unsupported.php',
              contentHash: 'sha256:unsupported',
              status: IndexCoverageStatus.Unsupported,
              reason: 'ADAPTER_UNSUPPORTED',
              capabilities: [],
            },
          ],
        }

        await store.replaceReferenceFacts(facts)

        const resolution = await new ResolveSymbolReference(store, async () => ({
          fresh: true,
          complete: true,
          reasonCodes: [],
        })).execute({
          workspace: 'code-graph',
          requested: 'Alpha',
          publicSurface: 'code-graph',
          symbolSpace: SymbolSpace.Value,
        })
        expect(resolution).toEqual({
          request: {
            workspace: 'code-graph',
            requested: 'Alpha',
            publicSurface: 'code-graph',
            symbolSpace: SymbolSpace.Value,
          },
          status: 'resolved',
          reasonCode: null,
          health: { fresh: true, complete: true, reasonCodes: [] },
          target: primary,
          candidates: [
            {
              target: primary,
              declarations: facts.declarations.map((entry) => entry.declaration),
              path: [{ fromId: directBinding.id, toId: primary.id, kind: 'export' }],
            },
          ],
          path: [{ fromId: directBinding.id, toId: primary.id, kind: 'export' }],
        })

        expect(
          await store.findLogicalSymbols([
            {
              workspace: 'code-graph',
              surface: 'src/alpha.ts',
              name: 'Alpha',
              space: SymbolSpace.Value,
              ownerId: undefined,
              memberForm: undefined,
            },
            {
              workspace: 'code-graph',
              surface: 'src/alpha.ts',
              name: 'run',
              space: SymbolSpace.Value,
              ownerId: primary.id,
              memberForm: MemberForm.Instance,
            },
          ]),
        ).toEqual([primary, member])
        expect(
          (await store.findDeclarations([primary.id])).map((item) => item.declaration.symbolId),
        ).toEqual([
          'code-graph:src/alpha.ts:class:Alpha:1:0',
          'code-graph:src/alpha.ts:class:Alpha:10:0',
        ])
        expect(
          (
            await store.findPublicBindings([
              { surface: 'code-graph', exportedName: 'AlphaAlias', space: SymbolSpace.Value },
              { surface: 'code-graph', exportedName: 'Alpha', space: SymbolSpace.Value },
            ])
          ).map((binding) => binding.exportedName),
        ).toEqual(['Alpha', 'AlphaAlias'])
        expect(
          (
            await store.findPublicBindingsByExportedNames([
              'AlphaAlias',
              'Alpha',
              'AlphaAlias',
              'Missing',
            ])
          ).map((binding) => `${binding.surface}:${binding.exportedName}`),
        ).toEqual(['code-graph:Alpha', 'code-graph:AlphaAlias', 'sdk:Alpha'])
        expect(await store.findPublicBindingsByExportedNames([])).toEqual([])
        expect(
          await store.findLocalBindings([
            {
              filePath: 'code-graph:src/consumer.ts',
              scopeId: 'module',
              localName: 'Alias',
              space: SymbolSpace.Value,
            },
          ]),
        ).toEqual([localBinding])
        expect(await store.findResolutionSteps([parallelBinding.id])).toEqual([
          { fromId: parallelBinding.id, toId: primary.id, kind: 'reexport' },
        ])
        expect(
          (
            await store.findIndexCoverage([
              'code-graph:src/unsupported.php',
              'code-graph:src/consumer.ts',
            ])
          ).map((coverage) => coverage.filePath),
        ).toEqual(['code-graph:src/consumer.ts', 'code-graph:src/unsupported.php'])
        expect((await store.getAllIndexCoverage()).map((coverage) => coverage.filePath)).toEqual([
          'code-graph:src/consumer.ts',
          'code-graph:src/unsupported.php',
        ])
        const snapshot = await store.getAllReferenceFacts()
        expect(snapshot.logicalSymbols.map((symbol) => symbol.id).sort()).toEqual(
          facts.logicalSymbols.map((symbol) => symbol.id).sort(),
        )
        expect(snapshot.declarations.map((item) => item.declaration.symbolId).sort()).toEqual(
          facts.declarations.map((item) => item.declaration.symbolId).sort(),
        )
        expect(snapshot.publicBindings.map((binding) => binding.id).sort()).toEqual(
          facts.publicBindings.map((binding) => binding.id).sort(),
        )
        expect(snapshot.localBindings).toEqual(facts.localBindings)
        expect(snapshot.steps.map((step) => JSON.stringify(step)).sort()).toEqual(
          facts.steps.map((step) => JSON.stringify(step)).sort(),
        )

        await store.replaceReferenceFacts({ ...facts, logicalSymbols: [member], declarations: [] })
        expect(
          await store.findLogicalSymbols([
            {
              workspace: 'code-graph',
              surface: 'src/alpha.ts',
              name: 'Alpha',
              space: SymbolSpace.Value,
              ownerId: undefined,
              memberForm: undefined,
            },
          ]),
        ).toEqual([])
        expect(await store.findDeclarations([primary.id])).toEqual([])
      })

      it('finds directly affected importer and symbol-dependent files in one operation', async () => {
        const targetFile = createFileNode({
          path: 'ws:target.ts',
          configRelativePath: 'target.ts',
          language: 'typescript',
          contentHash: 'target',
          workspace: 'ws',
        })
        const importerFile = createFileNode({
          path: 'ws:importer.ts',
          configRelativePath: 'importer.ts',
          language: 'typescript',
          contentHash: 'importer',
          workspace: 'ws',
        })
        const callerFile = createFileNode({
          path: 'ws:caller.ts',
          configRelativePath: 'caller.ts',
          language: 'typescript',
          contentHash: 'caller',
          workspace: 'ws',
        })
        const target = createSymbolNode({
          name: 'target',
          kind: SymbolKind.Function,
          filePath: targetFile.path,
          line: 1,
          column: 0,
        })
        const caller = createSymbolNode({
          name: 'caller',
          kind: SymbolKind.Function,
          filePath: callerFile.path,
          line: 1,
          column: 0,
        })
        await store.upsertFile(targetFile, [target], [])
        await store.upsertFile(
          importerFile,
          [],
          [
            createRelation({
              source: importerFile.path,
              target: targetFile.path,
              type: RelationType.Imports,
            }),
          ],
        )
        await store.upsertFile(
          callerFile,
          [caller],
          [createRelation({ source: caller.id, target: target.id, type: RelationType.Calls })],
        )

        await expect(store.findDirectlyAffectedFiles([targetFile.path])).resolves.toEqual([
          callerFile.path,
          importerFile.path,
        ])
      })

      it('findSymbols by kind', async () => {
        const file = createFileNode({
          path: 'src/main.ts',
          configRelativePath: '',
          language: 'typescript',
          contentHash: 'sha256:abc',
          workspace: '/project',
        })
        const fn = createSymbolNode({
          name: 'doSomething',
          kind: SymbolKind.Function,
          filePath: 'src/main.ts',
          line: 1,
          column: 0,
        })
        const cls = createSymbolNode({
          name: 'MyClass',
          kind: SymbolKind.Class,
          filePath: 'src/main.ts',
          line: 10,
          column: 0,
        })
        await store.upsertFile(file, [fn, cls], [])

        const functions = await store.findSymbols({ kind: SymbolKind.Function })
        expect(functions).toHaveLength(1)
        expect(functions[0]!.name).toBe('doSomething')
      })

      it('distinguishes case-exact symbol lookup from explicit case-insensitive fallback', async () => {
        const file = createFileNode({
          path: 'core:src/change.ts',
          configRelativePath: 'packages/core/src/change.ts',
          language: 'typescript',
          contentHash: 'sha256:case-lookup',
          workspace: 'core',
        })
        const upper = createSymbolNode({
          name: 'Change',
          kind: SymbolKind.Class,
          filePath: file.path,
          line: 1,
          column: 0,
        })
        const lower = createSymbolNode({
          name: 'change',
          kind: SymbolKind.Variable,
          filePath: file.path,
          line: 3,
          column: 0,
        })
        await store.upsertFile(file, [upper, lower], [])

        await expect(store.findSymbols({ name: 'Change', caseSensitive: true })).resolves.toEqual([
          upper,
        ])
        await expect(store.findSymbols({ name: 'CHANGE', caseSensitive: false })).resolves.toEqual([
          upper,
          lower,
        ])
      })

      it('getStatistics returns correct counts', async () => {
        const file = createFileNode({
          path: 'src/main.ts',
          configRelativePath: '',
          language: 'typescript',
          contentHash: 'sha256:abc',
          workspace: '/project',
        })
        const symbol = createSymbolNode({
          name: 'fn',
          kind: SymbolKind.Function,
          filePath: 'src/main.ts',
          line: 1,
          column: 0,
        })
        await store.upsertFile(file, [symbol], [])

        const stats = await store.getStatistics()
        expect(stats.fileCount).toBe(1)
        expect(stats.symbolCount).toBe(1)
        expect(stats.languages).toContain('typescript')
        expect(stats.lastIndexedRef).toBeNull()
        expect(stats.relationCounts[RelationType.Extends]).toBe(0)
        expect(stats.relationCounts[RelationType.Implements]).toBe(0)
        expect(stats.relationCounts[RelationType.Overrides]).toBe(0)
      })

      it('persists and queries CONSTRUCTS and USES_TYPE as symbol dependency relations', async () => {
        const file = createFileNode({
          path: 'src/composition.ts',
          configRelativePath: '',
          language: 'typescript',
          contentHash: 'sha256:deps',
          workspace: '/project',
        })
        const source = createSymbolNode({
          name: 'createRunner',
          kind: SymbolKind.Function,
          filePath: file.path,
          line: 1,
          column: 0,
        })
        const target = createSymbolNode({
          name: 'TemplateExpander',
          kind: SymbolKind.Class,
          filePath: file.path,
          line: 5,
          column: 0,
        })

        await store.bulkLoad({
          files: [file],
          symbols: [source, target],
          specs: [],
          relations: [
            createRelation({
              source: source.id,
              target: target.id,
              type: RelationType.Constructs,
            }),
            createRelation({
              source: source.id,
              target: target.id,
              type: RelationType.UsesType,
            }),
          ],
        })

        const callers = await store.getCallers(target.id)
        expect(callers.map((relation) => relation.type).sort()).toEqual([
          RelationType.Constructs,
          RelationType.UsesType,
        ])

        const callees = await store.getCallees(source.id)
        expect(callees.map((relation) => relation.type).sort()).toEqual([
          RelationType.Constructs,
          RelationType.UsesType,
        ])

        const stats = await store.getStatistics()
        expect(stats.relationCounts[RelationType.Constructs]).toBe(1)
        expect(stats.relationCounts[RelationType.UsesType]).toBe(1)
      })

      it('returns incoming EXTENDS relations via getExtenders', async () => {
        const file = createFileNode({
          path: 'src/types.ts',
          configRelativePath: '',
          language: 'typescript',
          contentHash: 'sha256:abc',
          workspace: '/project',
        })
        const base = createSymbolNode({
          name: 'BaseType',
          kind: SymbolKind.Class,
          filePath: 'src/types.ts',
          line: 1,
          column: 0,
        })
        const child = createSymbolNode({
          name: 'ChildType',
          kind: SymbolKind.Class,
          filePath: 'src/types.ts',
          line: 5,
          column: 0,
        })
        await store.upsertFile(
          file,
          [base, child],
          [
            createRelation({ source: file.path, target: base.id, type: RelationType.Defines }),
            createRelation({ source: file.path, target: child.id, type: RelationType.Defines }),
            createRelation({ source: child.id, target: base.id, type: RelationType.Extends }),
          ],
        )

        const extenders = await store.getExtenders(base.id)
        expect(extenders).toHaveLength(1)
        expect(extenders[0]?.source).toBe(child.id)
      })

      it('returns incoming IMPLEMENTS relations via getImplementors', async () => {
        const file = createFileNode({
          path: 'src/contracts.ts',
          configRelativePath: '',
          language: 'typescript',
          contentHash: 'sha256:def',
          workspace: '/project',
        })
        const contract = createSymbolNode({
          name: 'Persistable',
          kind: SymbolKind.Interface,
          filePath: file.path,
          line: 1,
          column: 0,
        })
        const impl = createSymbolNode({
          name: 'Repo',
          kind: SymbolKind.Class,
          filePath: file.path,
          line: 6,
          column: 0,
        })
        await store.upsertFile(
          file,
          [contract, impl],
          [
            createRelation({ source: file.path, target: contract.id, type: RelationType.Defines }),
            createRelation({ source: file.path, target: impl.id, type: RelationType.Defines }),
            createRelation({ source: impl.id, target: contract.id, type: RelationType.Implements }),
          ],
        )

        const implementors = await store.getImplementors(contract.id)
        expect(implementors).toHaveLength(1)
        expect(implementors[0]?.source).toBe(impl.id)
      })

      it('returns incoming OVERRIDES relations via getOverriders', async () => {
        const file = createFileNode({
          path: 'src/methods.ts',
          configRelativePath: '',
          language: 'typescript',
          contentHash: 'sha256:ghi',
          workspace: '/project',
        })
        const baseMethod = createSymbolNode({
          name: 'save',
          kind: SymbolKind.Method,
          filePath: file.path,
          line: 2,
          column: 2,
        })
        const childMethod = createSymbolNode({
          name: 'save',
          kind: SymbolKind.Method,
          filePath: file.path,
          line: 8,
          column: 2,
        })
        await store.upsertFile(
          file,
          [baseMethod, childMethod],
          [
            createRelation({
              source: file.path,
              target: baseMethod.id,
              type: RelationType.Defines,
            }),
            createRelation({
              source: file.path,
              target: childMethod.id,
              type: RelationType.Defines,
            }),
            createRelation({
              source: childMethod.id,
              target: baseMethod.id,
              type: RelationType.Overrides,
            }),
          ],
        )

        const overriders = await store.getOverriders(baseMethod.id)
        expect(overriders).toHaveLength(1)
        expect(overriders[0]?.source).toBe(childMethod.id)
      })

      it('lastIndexedRef defaults to null', async () => {
        const stats = await store.getStatistics()
        expect(stats.lastIndexedRef).toBeNull()
      })

      it('graphFingerprint defaults to null', async () => {
        const stats = await store.getStatistics()
        expect(stats.graphFingerprint).toBeNull()
      })

      it('documentCount reports indexed documents separately from files', async () => {
        await store.bulkLoad({
          files: [],
          documents: [
            createDocumentNode({
              path: 'root:docs/guide.md',
              configRelativePath: 'docs/guide.md',
              contentHash: 'sha256:doc',
              content: '# Guide',
              workspace: 'root',
            }),
          ],
          symbols: [],
          specs: [],
          relations: [],
        })
        const stats = await store.getStatistics()
        expect(stats.documentCount).toBe(1)
        expect(stats.fileCount).toBe(0)
      })

      it('graphFingerprint is set after bulkLoad', async () => {
        await store.bulkLoad({
          files: [],
          symbols: [],
          specs: [],
          relations: [],
          vcsRef: 'abc1234def',
          graphFingerprint: 'sha256:fp1',
        })
        const stats = await store.getStatistics()
        expect(stats.graphFingerprint).toBe('sha256:fp1')
      })

      it('graphFingerprint is cleared on clear()', async () => {
        await store.bulkLoad({
          files: [],
          symbols: [],
          specs: [],
          relations: [],
          vcsRef: 'abc1234def',
          graphFingerprint: 'sha256:fp1',
        })
        await store.clear()
        const stats = await store.getStatistics()
        expect(stats.graphFingerprint).toBeNull()
      })

      it('findFilesByConfigRelativePath returns exact matches', async () => {
        const file = createFileNode({
          path: 'core:src/model.ts',
          configRelativePath: 'packages/core/src/model.ts',
          language: 'typescript',
          contentHash: 'sha256:abc',
          workspace: 'core',
        })
        await store.upsertFile(file, [], [])
        const found = await store.findFilesByConfigRelativePath('packages/core/src/model.ts')
        expect(found).toHaveLength(1)
        expect(found[0]!.path).toBe('core:src/model.ts')
      })

      it('findDocumentsByConfigRelativePath returns exact matches', async () => {
        const document = createDocumentNode({
          path: 'root:docs/guide.md',
          configRelativePath: 'docs/guide.md',
          contentHash: 'sha256:doc',
          content: '# Guide\n\nHello graph',
          workspace: 'root',
        })
        await store.upsertDocument(document)
        const found = await store.findDocumentsByConfigRelativePath('docs/guide.md')
        expect(found).toHaveLength(1)
        expect(found[0]!.path).toBe('root:docs/guide.md')
      })

      it('findFilesByConfigRelativePath returns empty for no match', async () => {
        const found = await store.findFilesByConfigRelativePath('nonexistent/path.ts')
        expect(found).toHaveLength(0)
      })

      it('findFilesByConfigRelativePath returns multiple files across workspaces', async () => {
        const file1 = createFileNode({
          path: 'core:src/model.ts',
          configRelativePath: 'packages/core/src/model.ts',
          language: 'typescript',
          contentHash: 'sha256:1',
          workspace: 'core',
        })
        const file2 = createFileNode({
          path: 'cli:src/model.ts',
          configRelativePath: 'packages/core/src/model.ts',
          language: 'typescript',
          contentHash: 'sha256:2',
          workspace: 'cli',
        })
        await store.upsertFile(file1, [], [])
        await store.upsertFile(file2, [], [])
        const found = await store.findFilesByConfigRelativePath('packages/core/src/model.ts')
        expect(found).toHaveLength(2)
      })

      it('getFile returns configRelativePath', async () => {
        const file = createFileNode({
          path: 'core:src/model.ts',
          configRelativePath: 'packages/core/src/model.ts',
          language: 'typescript',
          contentHash: 'sha256:abc',
          workspace: 'core',
        })
        await store.upsertFile(file, [], [])
        const retrieved = await store.getFile('core:src/model.ts')
        expect(retrieved).toBeDefined()
        expect(retrieved!.configRelativePath).toBe('packages/core/src/model.ts')
      })

      it('lastIndexedRef is set after bulkLoad with vcsRef', async () => {
        await store.bulkLoad({
          files: [],
          symbols: [],
          specs: [],
          relations: [],
          vcsRef: 'abc1234def',
        })
        const stats = await store.getStatistics()
        expect(stats.lastIndexedRef).toBe('abc1234def')
      })

      it('lastIndexedRef is cleared on clear()', async () => {
        await store.bulkLoad({
          files: [],
          symbols: [],
          specs: [],
          relations: [],
          vcsRef: 'abc1234def',
        })
        await store.clear()
        const stats = await store.getStatistics()
        expect(stats.lastIndexedRef).toBeNull()
      })

      it('clear removes everything', async () => {
        const file = createFileNode({
          path: 'src/main.ts',
          configRelativePath: '',
          language: 'typescript',
          contentHash: 'sha256:abc',
          workspace: '/project',
        })
        await store.upsertFile(file, [], [])
        await store.clear()

        const stats = await store.getStatistics()
        expect(stats.fileCount).toBe(0)
        expect(stats.symbolCount).toBe(0)
      })

      it('getAllFiles returns all files', async () => {
        const file1 = createFileNode({
          path: 'a.ts',
          configRelativePath: '',
          language: 'typescript',
          contentHash: 'sha256:1',
          workspace: '/project',
        })
        const file2 = createFileNode({
          path: 'b.ts',
          configRelativePath: '',
          language: 'typescript',
          contentHash: 'sha256:2',
          workspace: '/project',
        })
        await store.upsertFile(file1, [], [])
        await store.upsertFile(file2, [], [])

        const all = await store.getAllFiles()
        expect(all).toHaveLength(2)
      })

      it('getAllDocuments returns all documents', async () => {
        await store.upsertDocument(
          createDocumentNode({
            path: 'root:docs/a.md',
            configRelativePath: 'docs/a.md',
            contentHash: 'sha256:a',
            content: 'alpha',
            workspace: 'root',
          }),
        )
        await store.upsertDocument(
          createDocumentNode({
            path: 'root:docs/b.md',
            configRelativePath: 'docs/b.md',
            contentHash: 'sha256:b',
            content: 'beta',
            workspace: 'root',
          }),
        )

        const all = await store.getAllDocuments()
        expect(all).toHaveLength(2)
      })

      it('upserts and retrieves spec nodes with dependencies', async () => {
        const spec1 = createSpecNode({
          specId: 'core:core/config',
          path: 'specs/core/config',
          title: 'Config',
          contentHash: 'sha256:a',
          workspace: 'test',
        })
        const spec2 = createSpecNode({
          specId: 'core:core/change',
          path: 'specs/core/change',
          title: 'Change',
          contentHash: 'sha256:b',
          dependsOn: ['core:core/config'],
          workspace: 'test',
        })
        await store.upsertSpec(spec1, [])
        await store.upsertSpec(spec2, [
          createRelation({
            source: 'core:core/change',
            target: 'core:core/config',
            type: RelationType.DependsOn,
          }),
        ])

        const retrieved = await store.getSpec('core:core/change')
        expect(retrieved).toBeDefined()
        expect(retrieved!.title).toBe('Change')

        const deps = await store.getSpecDependencies('core:core/change')
        expect(deps).toHaveLength(1)
        expect(deps[0]!.target).toBe('core:core/config')

        const dependents = await store.getSpecDependents('core:core/config')
        expect(dependents).toHaveLength(1)
        expect(dependents[0]!.source).toBe('core:core/change')
      })

      it('persists and retrieves relation metadata', async () => {
        const spec = createSpecNode({
          specId: 'core:auth',
          path: 'specs/auth',
          title: 'Auth',
          contentHash: 'sha256:a',
          workspace: 'test',
        })
        const symbol = createSymbolNode({
          name: 'login',
          kind: SymbolKind.Function,
          filePath: 'src/auth.ts',
          line: 1,
          column: 0,
        })
        const metadata = { stale: true, reason: 'symbol removed' }
        const rel = createRelation({
          source: spec.specId,
          target: symbol.id,
          type: RelationType.CoversSymbol,
          metadata,
        })

        // Use bulkLoad to ensure nodes exist before relation
        await store.bulkLoad({
          files: [
            createFileNode({
              path: 'src/auth.ts',
              configRelativePath: '',
              language: 'typescript',
              contentHash: 'sha256:b',
              workspace: 'test',
            }),
          ],
          symbols: [symbol],
          specs: [spec],
          relations: [rel],
        })

        const retrieved = await store.getCoveredSymbols(spec.specId)
        expect(retrieved).toHaveLength(1)
        expect(retrieved[0]!.metadata).toEqual(metadata)
      })

      it('batch-queries covering specs for files and symbols deterministically', async () => {
        const files = ['root:a.ts', 'root:b.ts'].map((path) =>
          createFileNode({
            path,
            configRelativePath: path.slice('root:'.length),
            language: 'typescript',
            contentHash: `hash:${path}`,
            workspace: 'root',
          }),
        )
        const symbols = files.map((file, index) =>
          createSymbolNode({
            name: `symbol${String(index)}`,
            kind: SymbolKind.Function,
            filePath: file.path,
            line: 1,
            column: 0,
          }),
        )
        const specs = ['spec:z', 'spec:a'].map((specId) =>
          createSpecNode({
            specId,
            path: `specs/${specId}`,
            title: specId,
            contentHash: `hash:${specId}`,
            workspace: 'root',
          }),
        )
        await store.bulkLoad({
          files,
          symbols,
          specs,
          relations: [
            createRelation({
              source: 'spec:z',
              target: files[1]!.path,
              type: RelationType.CoversFile,
            }),
            createRelation({
              source: 'spec:a',
              target: files[0]!.path,
              type: RelationType.CoversFile,
            }),
            createRelation({
              source: 'spec:z',
              target: symbols[0]!.id,
              type: RelationType.CoversSymbol,
            }),
            createRelation({
              source: 'spec:a',
              target: symbols[1]!.id,
              type: RelationType.CoversSymbol,
            }),
          ],
        })

        expect(await store.getCoveringSpecsForFiles(files.map((file) => file.path))).toEqual([
          expect.objectContaining({ source: 'spec:a', target: 'root:a.ts' }),
          expect.objectContaining({ source: 'spec:z', target: 'root:b.ts' }),
        ])
        expect(await store.getCoveringSpecsForSymbols(symbols.map((symbol) => symbol.id))).toEqual([
          expect.objectContaining({ source: 'spec:a', target: symbols[1]!.id }),
          expect.objectContaining({ source: 'spec:z', target: symbols[0]!.id }),
        ])
        expect(await store.getCoveringSpecsForFiles([])).toEqual([])
        expect(await store.getCoveringSpecsForSymbols([])).toEqual([])
      })

      it('ranks exact symbol, spec, and document matches first', async () => {
        const file = createFileNode({
          path: 'core:src/change.ts',
          configRelativePath: 'packages/core/src/change.ts',
          language: 'typescript',
          contentHash: 'sha256:file',
          workspace: 'core',
        })
        const exactSymbol = createSymbolNode({
          name: 'invalidate',
          kind: SymbolKind.Method,
          filePath: file.path,
          line: 1,
          column: 0,
        })
        const fuzzySymbol = createSymbolNode({
          name: 'invalidateLater',
          kind: SymbolKind.Method,
          filePath: file.path,
          line: 2,
          column: 0,
        })
        const exactSpec = createSpecNode({
          specId: 'core:change',
          path: 'change',
          title: 'Change',
          description: 'Handles invalidation',
          contentHash: 'sha256:spec1',
          content: 'change spec content',
          workspace: 'core',
        })
        const fuzzySpec = createSpecNode({
          specId: 'core:change-log',
          path: 'change-log',
          title: 'Change log',
          description: 'Mentions core:change',
          contentHash: 'sha256:spec2',
          content: 'core:change appears here too',
          workspace: 'core',
        })
        const exactDocument = createDocumentNode({
          path: 'root:docs/change.md',
          configRelativePath: 'docs/change.md',
          contentHash: 'sha256:doc1',
          content: 'Change guide',
          workspace: 'root',
        })
        const fuzzyDocument = createDocumentNode({
          path: 'root:docs/change-log.md',
          configRelativePath: 'docs/change-log.md',
          contentHash: 'sha256:doc2',
          content: 'This references docs/change.md',
          workspace: 'root',
        })

        await store.bulkLoad({
          files: [file],
          documents: [exactDocument, fuzzyDocument],
          symbols: [exactSymbol, fuzzySymbol],
          specs: [exactSpec, fuzzySpec],
          relations: [],
        })

        const symbolHits = await store.searchSymbols({ query: 'invalidate' })
        const specHits = await store.searchSpecs({ query: 'core:change' })
        const documentHits = await store.searchDocuments({ query: 'docs/change.md' })

        expect(symbolHits[0]?.symbol.id).toBe(exactSymbol.id)
        expect(symbolHits[0]?.snippet).toBeDefined()
        expect(specHits[0]?.spec.specId).toBe(exactSpec.specId)
        expect(specHits[0]?.snippet).toBeDefined()
        expect(documentHits[0]?.document.path).toBe(exactDocument.path)
        expect(documentHits[0]?.snippet).toBeDefined()
      })

      it('expands specd-shaped tokens and prefers identity hits over content-only hits', async () => {
        const specIdentity = createSpecNode({
          specId: 'core:change',
          path: 'change',
          title: 'Change',
          description: 'Identity target',
          contentHash: 'sha256:spec-identity',
          content: 'Implements change workflow',
          workspace: 'core',
        })
        const specContentOnly = createSpecNode({
          specId: 'core:workflow-history',
          path: 'workflow-history',
          title: 'Workflow history',
          description: 'Discusses core change semantics',
          contentHash: 'sha256:spec-content',
          content: 'core change core change core change',
          workspace: 'core',
        })

        await store.bulkLoad({
          files: [],
          documents: [],
          symbols: [],
          specs: [specIdentity, specContentOnly],
          relations: [],
        })

        const hits = await store.searchSpecs({ query: 'core:change' })
        expect(hits[0]?.spec.specId).toBe(specIdentity.specId)
      })

      it('expands CamelCase symbol queries and prefers declared names over comments', async () => {
        const file = createFileNode({
          path: 'core:src/archive-change.ts',
          configRelativePath: 'packages/core/src/archive-change.ts',
          language: 'typescript',
          contentHash: 'sha256:camel-file',
          content: 'export function ArchiveChange() {}\nexport function fallback() {}',
          workspace: 'core',
        })
        const declared = createSymbolNode({
          name: 'ArchiveChange',
          kind: SymbolKind.Function,
          filePath: file.path,
          line: 1,
          column: 0,
        })
        const commentOnly = createSymbolNode({
          name: 'fallback',
          kind: SymbolKind.Function,
          filePath: file.path,
          line: 2,
          column: 0,
          comment: 'archive change archive change archive change',
        })

        await store.bulkLoad({
          files: [file],
          documents: [],
          symbols: [declared, commentOnly],
          specs: [],
          relations: [],
        })

        const hits = await store.searchSymbols({ query: 'ArchiveChange' })
        expect(hits[0]?.symbol.id).toBe(declared.id)
      })

      it('orders token strength as exact before prefix before suffix before substring', async () => {
        const file = createFileNode({
          path: 'core:src/repository.ts',
          configRelativePath: 'packages/core/src/repository.ts',
          language: 'typescript',
          contentHash: 'sha256:token-strength',
          content: [
            'export function change() {}',
            'export function changeLog() {}',
            'export function prechange() {}',
            'export function exchangeRate() {}',
          ].join('\n'),
          workspace: 'core',
        })
        const exact = createSymbolNode({
          name: 'change',
          kind: SymbolKind.Function,
          filePath: file.path,
          line: 1,
          column: 0,
        })
        const prefix = createSymbolNode({
          name: 'changeLog',
          kind: SymbolKind.Function,
          filePath: file.path,
          line: 2,
          column: 0,
        })
        const suffix = createSymbolNode({
          name: 'prechange',
          kind: SymbolKind.Function,
          filePath: file.path,
          line: 3,
          column: 0,
        })
        const substring = createSymbolNode({
          name: 'exchangeRate',
          kind: SymbolKind.Function,
          filePath: file.path,
          line: 4,
          column: 0,
        })

        await store.bulkLoad({
          files: [file],
          documents: [],
          symbols: [exact, prefix, suffix, substring],
          specs: [],
          relations: [],
        })

        const hits = await store.searchSymbols({ query: 'change' })
        expect(hits[0]?.symbol.id).toBe(exact.id)
        expect(hits[1]?.symbol.id).toBe(prefix.id)
        expect(hits[2]?.symbol.id).toBe(suffix.id)
        expect(hits[3]?.symbol.id).toBe(substring.id)
      })

      it('prefers real identity components over arbitrary substrings', async () => {
        const componentSpec = createSpecNode({
          specId: 'core:change',
          path: 'change',
          title: 'Change',
          description: 'Core change target',
          contentHash: 'sha256:component',
          content: 'Implements core change flow',
          workspace: 'core',
        })
        const substringSpec = createSpecNode({
          specId: 'core:scorekeeper',
          path: 'scorekeeper',
          title: 'Scorekeeper',
          description: 'Contains core only as substring',
          contentHash: 'sha256:substring',
          content: 'score score score',
          workspace: 'core',
        })

        await store.bulkLoad({
          files: [],
          documents: [],
          symbols: [],
          specs: [componentSpec, substringSpec],
          relations: [],
        })

        const hits = await store.searchSpecs({ query: 'core' })
        expect(hits[0]?.spec.specId).toBe(componentSpec.specId)
      })

      it('pages bounded source-content candidates with expansion and filters', async () => {
        const sourceFiles = [
          createFileNode({
            path: 'root:a.ts',
            configRelativePath: 'a.ts',
            language: 'typescript',
            contentHash: 'a',
            workspace: 'root',
            content: 'const value = "analyzeFileImpact alpha beta xy"',
          }),
          createFileNode({
            path: 'root:b.ts',
            configRelativePath: 'b.ts',
            language: 'typescript',
            contentHash: 'b',
            workspace: 'root',
            content: 'const value = "analyze file impact alpha beta xy"',
          }),
          createFileNode({
            path: 'other:c.ts',
            configRelativePath: 'c.ts',
            language: 'typescript',
            contentHash: 'c',
            workspace: 'other',
            content: 'alpha beta xy',
          }),
          createFileNode({
            path: 'root:excluded.spec.ts',
            configRelativePath: 'excluded.spec.ts',
            language: 'typescript',
            contentHash: 'd',
            workspace: 'root',
            content: 'analyzeFileImpact alpha beta xy',
          }),
        ]
        await store.bulkLoad({ files: sourceFiles, symbols: [], specs: [], relations: [] })

        const request = {
          normalizedQuery: 'analyzefileimpact alpha beta',
          rawTerms: ['analyzefileimpact', 'alpha', 'beta'],
          expandedTerms: ['analyze', 'file', 'impact'],
          workspace: 'root',
          filePattern: 'root:*',
          excludePaths: ['*.spec.ts'],
          limit: 1,
        } as const
        const first = await store.searchSourceContentCandidates(request)
        const second = await store.searchSourceContentCandidates({
          ...request,
          cursor: first.nextCursor,
        })

        expect(first.candidates).toHaveLength(1)
        expect(second.candidates).toHaveLength(1)
        expect(
          [...first.candidates, ...second.candidates].map(({ file }) => file.path).sort(),
        ).toEqual(['root:a.ts', 'root:b.ts'])
        expect(second.nextCursor).toBeUndefined()

        const short = await store.searchSourceContentCandidates({
          normalizedQuery: 'xy',
          rawTerms: ['xy'],
          expandedTerms: ['xy'],
          workspace: 'other',
          limit: 10,
        })
        expect(short.candidates.map(({ file }) => file.path)).toEqual(['other:c.ts'])
      })
    })
  })
}

graphStoreContractTests('InMemoryGraphStore', () => new InMemoryGraphStore(), undefined, {
  supportsReferenceFacts: true,
})
