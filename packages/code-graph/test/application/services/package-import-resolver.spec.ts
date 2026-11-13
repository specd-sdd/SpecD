import { describe, expect, it, vi } from 'vitest'
import { PackageImportResolver } from '../../../src/application/services/package-import-resolver.js'
import { type IndexSession } from '../../../src/domain/value-objects/index-session.js'
import { type LanguageAdapter } from '../../../src/domain/value-objects/language-adapter.js'
import {
  type PackageEntry,
  type PackageResolutionFacet,
} from '../../../src/domain/value-objects/language-adapter-facets.js'
import {
  SymbolSpace,
  type PublicBinding,
} from '../../../src/domain/value-objects/symbol-reference.js'

interface FakeFile {
  readonly category: 'source' | 'test' | 'ignored'
}

/**
 * Builds a session double exposing only what the resolver reads.
 * @param files - Indexed files by workspace-prefixed path.
 * @param bindings - Public bindings available in the session.
 * @param declarations - Primary declaration symbol id by logical id.
 * @returns A session double and its `findSymbolsByName` spy.
 */
function fakeSession(
  files: Record<string, FakeFile>,
  bindings: readonly PublicBinding[],
  declarations: Record<string, string>,
): { readonly session: IndexSession; readonly findSymbolsByName: ReturnType<typeof vi.fn> } {
  const findSymbolsByName = vi.fn(() => [])
  const session = {
    getFileId: (path: string) => (files[path] === undefined ? undefined : 1),
    getFileCategory: (path: string) => files[path]?.category,
    findPublicBindings: (surface: string, exportedName: string, space: SymbolSpace) =>
      bindings.filter(
        (b) => b.surface === surface && b.exportedName === exportedName && b.space === space,
      ),
    getPrimaryDeclarationSymbolId: (logicalId: string) => declarations[logicalId],
    findSymbolsByName,
  } as unknown as IndexSession
  return { session, findSymbolsByName }
}

/**
 * Builds a public binding.
 * @param id - Binding id.
 * @param surface - Public surface.
 * @param exportedName - Exported spelling.
 * @param space - Symbol space.
 * @param targetId - Logical target.
 * @returns The binding.
 */
function binding(
  id: string,
  surface: string,
  exportedName: string,
  space: SymbolSpace,
  targetId: string | undefined,
): PublicBinding {
  return { id, surface, exportedName, space, targetId }
}

/**
 * Builds an adapter exposing a package resolution facet.
 * @param entries - Entries the facet returns.
 * @param matched - Package the facet matches, or undefined.
 * @returns The adapter double.
 */
function adapterWith(
  entries: readonly PackageEntry[],
  matched: string | undefined,
): LanguageAdapter {
  const packageResolution: PackageResolutionFacet = {
    identity: () => undefined,
    prepare: () => undefined,
    matchSpecifier: () => matched,
    entrySurface: () => entries,
  }
  return { packageResolution } as unknown as LanguageAdapter
}

const ENTRY: PackageEntry = {
  filePath: 'code-graph:src/public.ts',
  surface: 'code-graph:src/public.ts',
}
const PACKAGES = new Map([['@specd/code-graph', 'code-graph']])

describe('PackageImportResolver', () => {
  it('Given a name published by the entry, when resolved, then the target and step are returned', () => {
    const { session } = fakeSession(
      { 'code-graph:src/public.ts': { category: 'source' } },
      [binding('pub1', ENTRY.surface, 'SymbolNode', SymbolSpace.Type, 'logical:SymbolNode')],
      { 'logical:SymbolNode': 'code-graph:src/symbol-node.ts:interface:SymbolNode:1:1' },
    )
    const helpers = new PackageImportResolver({ session, packageToWorkspace: PACKAGES }).forAdapter(
      adapterWith([ENTRY], '@specd/code-graph'),
    )

    const result = helpers.resolvePackageExport({
      specifier: '@specd/code-graph',
      exportedName: 'SymbolNode',
      spaces: [SymbolSpace.Value, SymbolSpace.Type],
      fromFile: 'sdk:src/a.ts',
      localBindingId: 'local1',
    })

    expect(result).toEqual({
      status: 'resolved',
      targetLogicalId: 'logical:SymbolNode',
      targetSymbolId: 'code-graph:src/symbol-node.ts:interface:SymbolNode:1:1',
      entryFile: 'code-graph:src/public.ts',
      publicBindingId: 'pub1',
      step: { fromId: 'local1', toId: 'pub1', kind: 'import:package' },
    })
  })

  it('Given a unique internal symbol the entry does not publish, when resolved, then not-exported and no name search', () => {
    const { session, findSymbolsByName } = fakeSession(
      { 'code-graph:src/public.ts': { category: 'source' } },
      [],
      {},
    )
    const helpers = new PackageImportResolver({ session, packageToWorkspace: PACKAGES }).forAdapter(
      adapterWith([ENTRY], '@specd/code-graph'),
    )

    const result = helpers.resolvePackageExport({
      specifier: '@specd/code-graph',
      exportedName: 'Internal',
      spaces: [SymbolSpace.Value],
      fromFile: 'sdk:src/a.ts',
      localBindingId: 'local1',
    })

    expect(result).toEqual({ status: 'unresolved', reason: 'not-exported' })
    expect(findSymbolsByName).not.toHaveBeenCalled()
  })

  it('Given entries with different targets for a name, when resolved, then ambiguous', () => {
    const second: PackageEntry = {
      filePath: 'code-graph:src/other.ts',
      surface: 'code-graph:src/other.ts',
    }
    const { session } = fakeSession(
      {
        'code-graph:src/public.ts': { category: 'source' },
        'code-graph:src/other.ts': { category: 'source' },
      },
      [
        binding('a', ENTRY.surface, 'X', SymbolSpace.Value, 'logical:one'),
        binding('b', second.surface, 'X', SymbolSpace.Value, 'logical:two'),
      ],
      { 'logical:one': 's1', 'logical:two': 's2' },
    )
    const helpers = new PackageImportResolver({ session, packageToWorkspace: PACKAGES }).forAdapter(
      adapterWith([ENTRY, second], '@specd/code-graph'),
    )

    expect(
      helpers.resolvePackageExport({
        specifier: '@specd/code-graph',
        exportedName: 'X',
        spaces: [SymbolSpace.Value],
        fromFile: 'sdk:src/a.ts',
        localBindingId: 'l',
      }),
    ).toEqual({ status: 'unresolved', reason: 'ambiguous' })
  })

  it('Given a value and a type binding with different targets, when both spaces are asked, then ambiguous', () => {
    const { session } = fakeSession(
      { 'code-graph:src/public.ts': { category: 'source' } },
      [
        binding('a', ENTRY.surface, 'X', SymbolSpace.Value, 'logical:value'),
        binding('b', ENTRY.surface, 'X', SymbolSpace.Type, 'logical:type'),
      ],
      { 'logical:value': 's1', 'logical:type': 's2' },
    )
    const helpers = new PackageImportResolver({ session, packageToWorkspace: PACKAGES }).forAdapter(
      adapterWith([ENTRY], '@specd/code-graph'),
    )

    expect(
      helpers.resolvePackageExport({
        specifier: '@specd/code-graph',
        exportedName: 'X',
        spaces: [SymbolSpace.Value, SymbolSpace.Type],
        fromFile: 'sdk:src/a.ts',
        localBindingId: 'l',
      }),
    ).toEqual({ status: 'unresolved', reason: 'ambiguous' })
  })

  it('Given duplicate routes with the same target, when resolved, then the lowest binding id is used', () => {
    const { session } = fakeSession(
      { 'code-graph:src/public.ts': { category: 'source' } },
      [
        binding('z', ENTRY.surface, 'X', SymbolSpace.Value, 'logical:one'),
        binding('b', ENTRY.surface, 'X', SymbolSpace.Value, 'logical:one'),
      ],
      { 'logical:one': 's1' },
    )
    const helpers = new PackageImportResolver({ session, packageToWorkspace: PACKAGES }).forAdapter(
      adapterWith([ENTRY], '@specd/code-graph'),
    )

    const result = helpers.resolvePackageExport({
      specifier: '@specd/code-graph',
      exportedName: 'X',
      spaces: [SymbolSpace.Value],
      fromFile: 'sdk:src/a.ts',
      localBindingId: 'l',
    })

    expect(result.status === 'resolved' && result.publicBindingId).toBe('b')
  })

  it('Given a specifier no facet match, when entries are requested, then package-unknown', () => {
    const { session } = fakeSession({}, [], {})
    const helpers = new PackageImportResolver({ session, packageToWorkspace: PACKAGES }).forAdapter(
      adapterWith([ENTRY], undefined),
    )

    expect(helpers.packageEntryFiles('express')).toEqual({
      status: 'unresolved',
      reason: 'package-unknown',
    })
  })

  it('Given an adapter without the facet, when entries are requested, then facet-absent', () => {
    const { session } = fakeSession({}, [], {})
    const helpers = new PackageImportResolver({ session, packageToWorkspace: PACKAGES }).forAdapter(
      {} as unknown as LanguageAdapter,
    )

    expect(helpers.packageEntryFiles('@specd/code-graph')).toEqual({
      status: 'unresolved',
      reason: 'facet-absent',
    })
  })

  it('Given only unindexed or test entries, when entries are requested, then no-entry-surface', () => {
    const testEntry: PackageEntry = {
      filePath: 'code-graph:test/x.ts',
      surface: 'code-graph:test/x.ts',
    }
    const missing: PackageEntry = {
      filePath: 'code-graph:src/missing.ts',
      surface: 'code-graph:src/missing.ts',
    }
    const { session } = fakeSession({ 'code-graph:test/x.ts': { category: 'test' } }, [], {})
    const helpers = new PackageImportResolver({ session, packageToWorkspace: PACKAGES }).forAdapter(
      adapterWith([testEntry, missing], '@specd/code-graph'),
    )

    expect(helpers.packageEntryFiles('@specd/code-graph')).toEqual({
      status: 'unresolved',
      reason: 'no-entry-surface',
    })
  })

  it('Given a binding whose target has no declaration, when resolved, then not-exported', () => {
    const { session } = fakeSession(
      { 'code-graph:src/public.ts': { category: 'source' } },
      [binding('a', ENTRY.surface, 'X', SymbolSpace.Value, 'logical:orphan')],
      {},
    )
    const helpers = new PackageImportResolver({ session, packageToWorkspace: PACKAGES }).forAdapter(
      adapterWith([ENTRY], '@specd/code-graph'),
    )

    expect(
      helpers.resolvePackageExport({
        specifier: '@specd/code-graph',
        exportedName: 'X',
        spaces: [SymbolSpace.Value],
        fromFile: 'sdk:src/a.ts',
        localBindingId: 'l',
      }),
    ).toEqual({ status: 'unresolved', reason: 'not-exported' })
  })

  it('Given the same name published by another workspace, when resolved, then only the matched package entry is used', () => {
    const decoySurface = 'legacy:src/public.ts'
    const { session } = fakeSession(
      {
        'code-graph:src/public.ts': { category: 'source' },
        [decoySurface]: { category: 'source' },
      },
      [
        binding('decoy', decoySurface, 'SymbolNode', SymbolSpace.Type, 'logical:Decoy'),
        binding('pub1', ENTRY.surface, 'SymbolNode', SymbolSpace.Type, 'logical:SymbolNode'),
      ],
      { 'logical:Decoy': 'legacy:decoy', 'logical:SymbolNode': 'code-graph:real' },
    )
    const helpers = new PackageImportResolver({ session, packageToWorkspace: PACKAGES }).forAdapter(
      adapterWith([ENTRY], '@specd/code-graph'),
    )

    const result = helpers.resolvePackageExport({
      specifier: '@specd/code-graph',
      exportedName: 'SymbolNode',
      spaces: [SymbolSpace.Type],
      fromFile: 'sdk:src/a.ts',
      localBindingId: 'local1',
    })

    expect(result).toMatchObject({ status: 'resolved', targetSymbolId: 'code-graph:real' })
  })
})
