import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  resolveFileSelector,
  resolveSymbolSelector,
} from '../../../src/application/services/resolve-graph-selector.js'
import { createDocumentNode } from '../../../src/domain/value-objects/document-node.js'
import { createFileNode } from '../../../src/domain/value-objects/file-node.js'
import { createSymbolNode } from '../../../src/domain/value-objects/symbol-node.js'
import { InMemoryGraphStore } from '../../helpers/in-memory-graph-store.js'

describe('resolve-graph-selector', () => {
  let store: InMemoryGraphStore

  beforeEach(async () => {
    store = new InMemoryGraphStore()
    await store.open()
  })

  afterEach(async () => {
    await store.close()
  })

  it('resolves project-relative selectors across files and documents', async () => {
    await store.upsertFile(
      createFileNode({
        path: 'core:src/index.ts',
        configRelativePath: 'packages/core/src/index.ts',
        language: 'typescript',
        contentHash: 'sha256:file',
        workspace: 'core',
      }),
      [],
      [],
    )
    await store.upsertDocument(
      createDocumentNode({
        path: 'root:docs/guide.md',
        configRelativePath: 'docs/guide.md',
        contentHash: 'sha256:doc',
        content: '# Guide',
        workspace: 'root',
      }),
    )

    const fileMatches = await resolveFileSelector('packages/core/src/index.ts', { store })
    const documentMatches = await resolveFileSelector('docs/guide.md', { store })

    expect(fileMatches).toEqual([
      {
        canonicalPath: 'core:src/index.ts',
        configRelativePath: 'packages/core/src/index.ts',
        workspace: 'core',
        kind: 'file',
      },
    ])
    expect(documentMatches).toEqual([
      {
        canonicalPath: 'root:docs/guide.md',
        configRelativePath: 'docs/guide.md',
        workspace: 'root',
        kind: 'document',
      },
    ])
  })

  it('prefers full symbol ids and qualified selectors before bare names', async () => {
    const file = createFileNode({
      path: 'core:src/domain/entities/change.ts',
      configRelativePath: 'packages/core/src/domain/entities/change.ts',
      language: 'typescript',
      contentHash: 'sha256:file',
      workspace: 'core',
    })
    const symbol = createSymbolNode({
      name: 'invalidate',
      kind: 'method',
      filePath: file.path,
      line: 697,
      column: 2,
    })

    await store.upsertFile(file, [symbol], [])

    const fullIdMatches = await resolveSymbolSelector(symbol.id, { store })
    const qualifiedMatches = await resolveSymbolSelector(
      'packages/core/src/domain/entities/change.ts:method:invalidate',
      { store },
    )
    const bareMatches = await resolveSymbolSelector('invalidate', { store })

    expect(fullIdMatches).toEqual({
      status: 'resolved',
      match: {
        symbolId: symbol.id,
        filePath: file.path,
        matchKind: 'full-id',
      },
    })
    expect(qualifiedMatches).toEqual({
      status: 'resolved',
      match: {
        symbolId: symbol.id,
        filePath: file.path,
        matchKind: 'qualified',
      },
    })
    expect(bareMatches).toEqual({
      status: 'resolved',
      match: {
        symbolId: symbol.id,
        filePath: file.path,
        matchKind: 'name',
      },
    })
  })

  it('prefers case-exact bare names and bounds exact ambiguity', async () => {
    const file = createFileNode({
      path: 'core:src/change.ts',
      configRelativePath: 'packages/core/src/change.ts',
      language: 'typescript',
      contentHash: 'sha256:change',
      workspace: 'core',
    })
    const exact = createSymbolNode({
      name: 'Change',
      kind: 'class',
      filePath: file.path,
      line: 1,
      column: 0,
    })
    const lower = Array.from({ length: 12 }, (_, index) =>
      createSymbolNode({
        name: 'change',
        kind: 'variable',
        filePath: file.path,
        line: index + 2,
        column: 0,
      }),
    )
    await store.upsertFile(file, [exact, ...lower], [])

    expect(await resolveSymbolSelector('Change', { store })).toEqual({
      status: 'resolved',
      match: { symbolId: exact.id, filePath: file.path, matchKind: 'name' },
    })

    expect(await resolveSymbolSelector('change', { store })).toMatchObject({
      status: 'ambiguous',
      totalCandidates: 12,
      candidates: expect.arrayContaining([
        expect.objectContaining({ symbolId: lower[0]!.id, matchKind: 'name' }),
      ]),
    })
    const ambiguous = await resolveSymbolSelector('change', { store })
    expect(ambiguous.status === 'ambiguous' ? ambiguous.candidates : []).toHaveLength(10)
  })

  it('does not widen bare impact selectors to prefixes', async () => {
    const file = createFileNode({
      path: 'core:src/validate.ts',
      configRelativePath: 'packages/core/src/validate.ts',
      language: 'typescript',
      contentHash: 'sha256:validate',
      workspace: 'core',
    })
    await store.upsertFile(
      file,
      [
        createSymbolNode({
          name: 'ValidateArtifacts',
          kind: 'class',
          filePath: file.path,
          line: 1,
          column: 0,
        }),
      ],
      [],
    )

    expect(await resolveSymbolSelector('ValidateArtifact', { store })).toEqual({
      status: 'missing',
      candidates: [],
    })
  })
})
