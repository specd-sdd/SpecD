import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  resolveFileSelector,
  resolveSymbolSelector,
} from '../../../src/application/services/resolve-graph-selector.js'
import { createDocumentNode } from '../../../src/domain/value-objects/document-node.js'
import { createFileNode } from '../../../src/domain/value-objects/file-node.js'
import { createSymbolNode } from '../../../src/domain/value-objects/symbol-node.js'
import {
  createLogicalSymbol,
  SymbolSpace,
} from '../../../src/domain/value-objects/symbol-reference.js'
import { ResolveSymbolReference } from '../../../src/application/use-cases/resolve-symbol-reference.js'
import { InMemoryGraphStore } from '../../helpers/in-memory-graph-store.js'

describe('resolve-graph-selector', () => {
  let store: InMemoryGraphStore

  const freshResolveReference = (
    input: Parameters<ResolveSymbolReference['execute']>[0],
  ): ReturnType<ResolveSymbolReference['execute']> =>
    new ResolveSymbolReference(store, async () => ({
      fresh: true,
      complete: true,
      reasonCodes: [],
    })).execute(input)

  const selectorOptions = (): {
    store: InMemoryGraphStore
    resolveReference: typeof freshResolveReference
  } => ({
    store,
    resolveReference: freshResolveReference,
  })

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
        projectRelativePath: 'packages/core/src/index.ts',
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
        projectRelativePath: 'docs/guide.md',
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
        projectRelativePath: 'packages/core/src/index.ts',
        workspace: 'core',
        kind: 'file',
      },
    ])
    expect(documentMatches).toEqual([
      {
        canonicalPath: 'root:docs/guide.md',
        projectRelativePath: 'docs/guide.md',
        workspace: 'root',
        kind: 'document',
      },
    ])
  })

  it('prefers full symbol ids and qualified selectors before bare names', async () => {
    const file = createFileNode({
      path: 'core:src/domain/entities/change.ts',
      projectRelativePath: 'packages/core/src/domain/entities/change.ts',
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

    const fullIdMatches = await resolveSymbolSelector(symbol.id, selectorOptions())
    const qualifiedMatches = await resolveSymbolSelector(
      'packages/core/src/domain/entities/change.ts:method:invalidate',
      selectorOptions(),
    )
    const bareMatches = await resolveSymbolSelector('invalidate', selectorOptions())

    expect(fullIdMatches).toMatchObject({
      status: 'resolved',
      kind: 'declaration',
      target: { kind: 'declaration', declaration: { symbolId: symbol.id } },
      match: {
        symbolId: symbol.id,
        filePath: file.path,
        matchKind: 'full-id',
      },
    })
    expect(qualifiedMatches).toMatchObject({
      status: 'resolved',
      kind: 'declaration',
      target: { kind: 'declaration', declaration: { symbolId: symbol.id } },
      match: {
        symbolId: symbol.id,
        filePath: file.path,
        matchKind: 'qualified',
      },
    })
    expect(bareMatches).toMatchObject({
      status: 'resolved',
      kind: 'declaration',
      target: { kind: 'declaration', declaration: { symbolId: symbol.id } },
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
      projectRelativePath: 'packages/core/src/change.ts',
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

    expect(await resolveSymbolSelector('Change', selectorOptions())).toMatchObject({
      status: 'resolved',
      kind: 'declaration',
      match: { symbolId: exact.id, filePath: file.path, matchKind: 'name' },
    })

    expect(await resolveSymbolSelector('change', selectorOptions())).toMatchObject({
      status: 'ambiguous',
      totalCandidates: 12,
      candidates: expect.arrayContaining([
        expect.objectContaining({ symbolId: lower[0]!.id, matchKind: 'name' }),
      ]),
    })
    const ambiguous = await resolveSymbolSelector('change', selectorOptions())
    expect(ambiguous.status === 'ambiguous' ? ambiguous.candidates : []).toHaveLength(10)
  })

  it('does not widen bare impact selectors to prefixes', async () => {
    const file = createFileNode({
      path: 'core:src/validate.ts',
      projectRelativePath: 'packages/core/src/validate.ts',
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

    expect(await resolveSymbolSelector('ValidateArtifact', selectorOptions())).toEqual({
      status: 'missing',
      candidates: [],
    })
  })

  it('resolves an unanchored qualified member without falling through to the bare name', async () => {
    const file = createFileNode({
      path: 'core:src/edit.ts',
      projectRelativePath: 'packages/core/src/edit.ts',
      language: 'typescript',
      contentHash: 'sha256:edit',
      workspace: 'core',
    })
    const execute = createSymbolNode({
      name: 'execute',
      kind: 'method',
      filePath: file.path,
      line: 4,
      column: 2,
    })
    const owner = createLogicalSymbol({
      workspace: 'core',
      surface: file.path,
      name: 'EditChange',
      space: SymbolSpace.Type,
      ownerId: undefined,
      memberSemantics: undefined,
    })
    const member = createLogicalSymbol({
      workspace: 'core',
      surface: file.path,
      name: 'execute',
      space: SymbolSpace.Value,
      ownerId: owner.id,
      memberSemantics: { kind: 'method', dispatch: 'instance' },
    })
    const otherOwner = createLogicalSymbol({
      workspace: 'core',
      surface: 'core:src/other.ts',
      name: 'EditChange',
      space: SymbolSpace.Type,
      ownerId: undefined,
      memberSemantics: undefined,
    })
    const otherMember = createLogicalSymbol({
      workspace: 'core',
      surface: 'core:src/other.ts',
      name: 'execute',
      space: SymbolSpace.Value,
      ownerId: otherOwner.id,
      memberSemantics: { kind: 'method', dispatch: 'instance' },
    })
    const otherFile = createFileNode({
      path: 'core:src/other.ts',
      projectRelativePath: 'packages/core/src/other.ts',
      language: 'typescript',
      contentHash: 'sha256:other',
      workspace: 'core',
    })
    const otherSymbol = createSymbolNode({
      name: 'execute',
      kind: 'method',
      filePath: otherFile.path,
      line: 2,
      column: 0,
    })
    await store.upsertFile(file, [execute], [])
    await store.upsertFile(otherFile, [otherSymbol], [])
    await store.replaceReferenceFacts({
      logicalSymbols: [owner, member, otherOwner, otherMember],
      declarations: [
        {
          logicalSymbolId: member.id,
          declaration: {
            logicalId: member.id,
            symbolId: execute.id,
            location: { filePath: file.path, line: 4, column: 2, endLine: 4, endColumn: 8 },
            kind: 'method',
          },
        },
        {
          logicalSymbolId: otherMember.id,
          declaration: {
            logicalId: otherMember.id,
            symbolId: otherSymbol.id,
            location: { filePath: otherFile.path, line: 2, column: 0, endLine: 2, endColumn: 6 },
            kind: 'method',
          },
        },
      ],
      publicBindings: [],
      localBindings: [],
      steps: [],
      coverage: [],
    })
    const resolveReference = (input: { workspace: string; requested: string }) =>
      new ResolveSymbolReference(store, async () => ({
        fresh: true,
        complete: true,
        reasonCodes: [],
      })).execute(input)

    const oneOwner = await resolveSymbolSelector('ArchiveChange::missing', {
      store,
      resolveReference,
    })
    expect(oneOwner).toEqual({ status: 'missing', candidates: [] })

    const both = await resolveSymbolSelector('EditChange.execute', { store, resolveReference })
    expect(both.status).toBe('ambiguous')
    if (both.status === 'ambiguous') {
      expect(both.totalCandidates).toBe(2)
      expect(both.candidates.map((candidate) => candidate.symbolId).sort()).toEqual(
        [execute.id, otherSymbol.id].sort(),
      )
    }

    const native = await resolveSymbolSelector('EditChange::execute', { store, resolveReference })
    expect(native).toEqual(both)
  })

  it('normalizes absolute path selector against projectRoot before lookup', async () => {
    const file = createFileNode({
      path: 'core:src/index.ts',
      projectRelativePath: 'packages/core/src/index.ts',
      language: 'typescript',
      contentHash: 'sha256:abs',
      workspace: 'core',
    })
    await store.upsertFile(file, [], [])

    const resolved = await resolveFileSelector('/project/packages/core/src/index.ts', {
      store,
      projectRoot: '/project',
    })

    expect(resolved).toEqual([
      {
        canonicalPath: 'core:src/index.ts',
        projectRelativePath: 'packages/core/src/index.ts',
        workspace: 'core',
        kind: 'file',
      },
    ])
  })

  it('supports project-relative lookup with parent segments', async () => {
    const file = createFileNode({
      path: 'core:src/index.ts',
      projectRelativePath: '../../packages/core/src/index.ts',
      language: 'typescript',
      contentHash: 'sha256:parent',
      workspace: 'core',
    })
    await store.upsertFile(file, [], [])

    const resolved = await resolveFileSelector('../../packages/core/src/index.ts', {
      store,
    })

    expect(resolved).toEqual([
      {
        canonicalPath: 'core:src/index.ts',
        projectRelativePath: '../../packages/core/src/index.ts',
        workspace: 'core',
        kind: 'file',
      },
    ])
  })

  it('does not merge same-name members of one container without a shared logical id', async () => {
    const file = createFileNode({
      path: 'core:src/service.ts',
      projectRelativePath: 'packages/core/src/service.ts',
      language: 'typescript',
      contentHash: 'sha256:service',
      workspace: 'core',
    })
    const classSymbol = createSymbolNode({
      name: 'Service',
      kind: 'class',
      filePath: file.path,
      line: 1,
      column: 0,
    })
    const overload1 = createSymbolNode({
      name: 'send',
      kind: 'method',
      filePath: file.path,
      line: 5,
      column: 2,
      parentId: classSymbol.id,
    })
    const overload2 = createSymbolNode({
      name: 'send',
      kind: 'method',
      filePath: file.path,
      line: 10,
      column: 2,
      parentId: classSymbol.id,
    })
    await store.upsertFile(file, [classSymbol, overload1, overload2], [])

    const result = await resolveSymbolSelector(
      'packages/core/src/service.ts:send',
      selectorOptions(),
    )
    expect(result.status).toBe('ambiguous')
    if (result.status === 'ambiguous') {
      expect(result.totalCandidates).toBe(2)
      expect(result.candidates.map((candidate) => candidate.symbolId).sort()).toEqual(
        [overload1.id, overload2.id].sort(),
      )
    }
  })

  it('unifies candidates sharing the same logicalId into a resolved outcome', async () => {
    const file = createFileNode({
      path: 'core:src/logical-service.ts',
      projectRelativePath: 'packages/core/src/logical-service.ts',
      language: 'typescript',
      contentHash: 'sha256:logical-service',
      workspace: 'core',
    })
    const overload1 = createSymbolNode({
      name: 'query',
      kind: 'method',
      filePath: file.path,
      line: 5,
      column: 2,
    })
    const overload2 = createSymbolNode({
      name: 'query',
      kind: 'method',
      filePath: file.path,
      line: 12,
      column: 2,
    })
    const owner = createLogicalSymbol({
      workspace: 'core',
      surface: file.path,
      name: 'LogicalService',
      space: SymbolSpace.Type,
      ownerId: undefined,
      memberSemantics: undefined,
    })
    const member = createLogicalSymbol({
      workspace: 'core',
      surface: file.path,
      name: 'query',
      space: SymbolSpace.Value,
      ownerId: owner.id,
      memberSemantics: { kind: 'method', dispatch: 'instance' },
    })

    await store.upsertFile(file, [overload1, overload2], [])
    await store.replaceReferenceFacts({
      logicalSymbols: [owner, member],
      declarations: [
        {
          logicalSymbolId: member.id,
          declaration: {
            logicalId: member.id,
            symbolId: overload1.id,
            location: { filePath: file.path, line: 5, column: 2, endLine: 5, endColumn: 7 },
            kind: 'method',
          },
        },
        {
          logicalSymbolId: member.id,
          declaration: {
            logicalId: member.id,
            symbolId: overload2.id,
            location: { filePath: file.path, line: 12, column: 2, endLine: 12, endColumn: 7 },
            kind: 'method',
          },
        },
      ],
      publicBindings: [],
      localBindings: [],
      steps: [],
      coverage: [],
    })
    const resolveReference = (input: { workspace: string; requested: string }) =>
      new ResolveSymbolReference(store, async () => ({
        fresh: true,
        complete: true,
        reasonCodes: [],
      })).execute(input)

    const result = await resolveSymbolSelector('LogicalService.query', { store, resolveReference })
    expect(result.status).toBe('resolved')
    if (result.status === 'resolved') {
      expect([overload1.id, overload2.id]).toContain(result.match.symbolId)
      expect(result.match.logicalId).toBe(member.id)
    }
  })

  it('given an overload set selected by file-qualified name, when resolved, then returns one typed logical target with every declaration', async () => {
    const file = createFileNode({
      path: 'core:src/overloads.ts',
      projectRelativePath: 'packages/core/src/overloads.ts',
      language: 'typescript',
      contentHash: 'sha256:overloads',
      workspace: 'core',
    })
    const overloads = [5, 9, 13].map((line) =>
      createSymbolNode({ name: 'send', kind: 'method', filePath: file.path, line, column: 2 }),
    )
    const owner = createLogicalSymbol({
      workspace: 'core',
      surface: file.path,
      name: 'Mailer',
      space: SymbolSpace.Type,
      ownerId: undefined,
      memberSemantics: undefined,
    })
    const member = createLogicalSymbol({
      workspace: 'core',
      surface: file.path,
      name: 'send',
      space: SymbolSpace.Value,
      ownerId: owner.id,
      memberSemantics: { kind: 'method', dispatch: 'instance' },
    })
    await store.upsertFile(file, overloads, [])
    await store.replaceReferenceFacts({
      logicalSymbols: [owner, member],
      declarations: overloads.map((symbol) => ({
        logicalSymbolId: member.id,
        declaration: {
          logicalId: member.id,
          symbolId: symbol.id,
          location: {
            filePath: file.path,
            line: symbol.line,
            column: 2,
            endLine: symbol.line,
            endColumn: 6,
          },
          kind: 'method' as const,
        },
      })),
      publicBindings: [],
      localBindings: [],
      steps: [],
      coverage: [],
    })
    const resolveReference = (input: { workspace: string; requested: string }) =>
      new ResolveSymbolReference(store, async () => ({
        fresh: true,
        complete: true,
        reasonCodes: [],
      })).execute(input)

    const result = await resolveSymbolSelector('packages/core/src/overloads.ts:send', {
      store,
      resolveReference,
    })

    expect(result.status).toBe('resolved')
    if (result.status === 'resolved' && result.kind === 'logical-target') {
      expect(result.target.logicalSymbol.id).toBe(member.id)
      expect(result.target.declarations.map((d) => d.symbolId).sort()).toEqual(
        overloads.map((o) => o.id).sort(),
      )
    } else {
      throw new Error(`expected a typed logical target, got ${JSON.stringify(result)}`)
    }
  })

  it('reports an unresolved selector with the resolver reason instead of missing', async () => {
    const result = await resolveSymbolSelector('Owner.run', {
      store,
      resolveReference: () =>
        Promise.resolve({
          request: { workspace: '', requested: 'Owner.run' },
          status: 'unresolved',
          reasonCode: 'CONTENT_DIRTY',
          health: { fresh: false, complete: true, reasonCodes: ['CONTENT_DIRTY'] },
          resolvedTarget: null,
          target: null,
          candidates: [],
          path: [],
        }),
    })

    expect(result).toEqual({ status: 'unresolved', reasonCode: 'CONTENT_DIRTY', candidates: [] })
  })

  describe('typed targets for overload groups', () => {
    const file = createFileNode({
      path: 'core:src/groups.ts',
      projectRelativePath: 'packages/core/src/groups.ts',
      language: 'typescript',
      contentHash: 'sha256:groups',
      workspace: 'core',
    })
    const sendOverloads = [5, 9].map((line) =>
      createSymbolNode({ name: 'send', kind: 'function', filePath: file.path, line, column: 0 }),
    )
    const fetchOverloads = [20, 24].map((line) =>
      createSymbolNode({ name: 'send', kind: 'function', filePath: file.path, line, column: 0 }),
    )
    const logicalFor = (surface: string): ReturnType<typeof createLogicalSymbol> =>
      createLogicalSymbol({
        workspace: 'core',
        surface,
        name: 'send',
        space: SymbolSpace.Value,
        ownerId: undefined,
        memberSemantics: undefined,
      })

    beforeEach(async () => {
      await store.upsertFile(file, [...sendOverloads, ...fetchOverloads], [])
    })

    const index = async (
      groups: readonly {
        readonly logical: ReturnType<typeof createLogicalSymbol>
        readonly symbols: readonly ReturnType<typeof createSymbolNode>[]
      }[],
    ): Promise<void> => {
      await store.replaceReferenceFacts({
        logicalSymbols: groups.map((group) => group.logical),
        declarations: groups.flatMap((group) =>
          group.symbols.map((symbol) => ({
            logicalSymbolId: group.logical.id,
            declaration: {
              logicalId: group.logical.id,
              symbolId: symbol.id,
              location: {
                filePath: file.path,
                line: symbol.line,
                column: 0,
                endLine: symbol.line,
                endColumn: 4,
              },
              kind: 'function' as const,
            },
          })),
        ),
        publicBindings: [],
        localBindings: [],
        steps: [],
        coverage: [],
      })
    }

    it('returns a logical target with every declaration for a location-id selector', async () => {
      const logical = logicalFor(file.path)
      await index([{ logical, symbols: sendOverloads }])

      const result = await resolveSymbolSelector(sendOverloads[0]!.id, selectorOptions())

      expect(result).toMatchObject({ status: 'resolved', kind: 'logical-target' })
      if (result.status === 'resolved' && result.kind === 'logical-target') {
        expect(result.target.declarations.map((d) => d.symbolId).sort()).toEqual(
          sendOverloads.map((symbol) => symbol.id).sort(),
        )
      }
    })

    it('returns a logical target for a full-id selector', async () => {
      const logical = logicalFor(file.path)
      await index([{ logical, symbols: sendOverloads }])
      const symbol = sendOverloads[1]!

      const result = await resolveSymbolSelector(
        `packages/core/src/groups.ts:function:send:${String(symbol.line)}:0`,
        selectorOptions(),
      )

      expect(result).toMatchObject({ status: 'resolved', kind: 'logical-target' })
    })

    it('counts candidates as logical targets with overloads collapsed', async () => {
      const first = logicalFor(file.path)
      const second = logicalFor(`${file.path}#other`)
      await index([
        { logical: first, symbols: sendOverloads },
        { logical: second, symbols: fetchOverloads },
      ])

      const result = await resolveSymbolSelector('send', selectorOptions())

      expect(result.status).toBe('ambiguous')
      if (result.status === 'ambiguous') {
        expect(result.totalCandidates).toBe(2)
        expect(result.candidates).toHaveLength(2)
        expect(new Set(result.candidates.map((candidate) => candidate.logicalId))).toEqual(
          new Set([first.id, second.id]),
        )
      }
    })

    it('propagates store errors instead of falling back to a physical outcome', async () => {
      const failing = {
        ...selectorOptions(),
        store: Object.assign(Object.create(store) as InMemoryGraphStore, {
          findLogicalDeclarationsByDeclarationIds: () => Promise.reject(new Error('store down')),
        }),
      }

      await expect(resolveSymbolSelector('send', failing)).rejects.toThrow('store down')
    })
  })

  it('treats member candidates with the same name across different parent classes as ambiguous', async () => {
    const file = createFileNode({
      path: 'core:src/dual.ts',
      projectRelativePath: 'packages/core/src/dual.ts',
      language: 'typescript',
      contentHash: 'sha256:dual',
      workspace: 'core',
    })
    const classA = createSymbolNode({
      name: 'ClassA',
      kind: 'class',
      filePath: file.path,
      line: 1,
      column: 0,
    })
    const classB = createSymbolNode({
      name: 'ClassB',
      kind: 'class',
      filePath: file.path,
      line: 20,
      column: 0,
    })
    const methodA = createSymbolNode({
      name: 'render',
      kind: 'method',
      filePath: file.path,
      line: 5,
      column: 2,
      parentId: classA.id,
    })
    const methodB = createSymbolNode({
      name: 'render',
      kind: 'method',
      filePath: file.path,
      line: 25,
      column: 2,
      parentId: classB.id,
    })
    await store.upsertFile(file, [classA, classB, methodA, methodB], [])

    const result = await resolveSymbolSelector(
      'packages/core/src/dual.ts:render',
      selectorOptions(),
    )
    expect(result.status).toBe('ambiguous')
    if (result.status === 'ambiguous') {
      expect(result.totalCandidates).toBe(2)
      expect(result.candidates.map((c) => c.symbolId).sort()).toEqual(
        [methodA.id, methodB.id].sort(),
      )
    }
  })
})
