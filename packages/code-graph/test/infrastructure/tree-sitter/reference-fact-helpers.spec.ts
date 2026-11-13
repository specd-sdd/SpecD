import { describe, expect, it } from 'vitest'
import { createSymbolNode } from '../../../src/domain/value-objects/symbol-node.js'
import { SymbolKind } from '../../../src/domain/value-objects/symbol-kind.js'
import {
  DeclarationOccurrenceForm,
  MemberAccessor,
  MemberDispatch,
  MemberKind,
  SymbolSpace,
} from '../../../src/domain/value-objects/symbol-reference.js'
import {
  buildHierarchyReferenceFacts,
  buildLogicalDeclarationFacts,
  containsSymbolRange,
  createAdapterDeclarationDescriptor,
  createCallableContainmentIndex,
  createDeclarationSymbolIndex,
  createImportedHierarchyMetadata,
  createPhysicalOnlyDeclarationDescriptor,
  createLexicalBindingDeclarationDescriptor,
  findContainingCallableSymbol,
  withEnclosingTypeParents,
  type CallableContainmentPolicy,
  type StructuralWorkKind,
  type StructuralWorkObserver,
} from '../../../src/infrastructure/tree-sitter/reference-fact-helpers.js'

function symbol(name: string, kind: SymbolKind, line: number) {
  return createSymbolNode({
    name,
    kind,
    filePath: 'ws:src/example.ts',
    line,
    column: 0,
    endLine: line,
    endColumn: name.length,
  })
}

describe('reference fact helpers', () => {
  it('proves same-line containment from complete construct columns', () => {
    const owner = createSymbolNode({
      name: 'Owner',
      kind: SymbolKind.Class,
      filePath: 'ws:src/example.ts',
      line: 1,
      column: 0,
      endLine: 1,
      endColumn: 30,
    })
    const member = createSymbolNode({
      name: 'run',
      kind: SymbolKind.Method,
      filePath: owner.filePath,
      line: 1,
      column: 14,
      endLine: 1,
      endColumn: 24,
    })

    expect(containsSymbolRange(owner, member)).toBe(true)
    expect(containsSymbolRange(member, owner)).toBe(false)
  })

  it('constructs same-name members beneath their logical owners', () => {
    const firstOwner = symbol('First', SymbolKind.Class, 1)
    const secondOwner = symbol('Second', SymbolKind.Class, 3)
    const firstMember = symbol('save', SymbolKind.Method, 2)
    const secondMember = symbol('save', SymbolKind.Method, 4)

    const facts = buildLogicalDeclarationFacts({
      workspace: 'ws',
      declarations: [
        {
          symbol: firstMember,
          surface: firstMember.filePath,
          space: SymbolSpace.Value,
          ownerSymbolId: firstOwner.id,
          memberSemantics: { kind: MemberKind.Method, dispatch: MemberDispatch.Instance },
        },
        {
          symbol: secondMember,
          surface: secondMember.filePath,
          space: SymbolSpace.Value,
          ownerSymbolId: secondOwner.id,
          memberSemantics: { kind: MemberKind.Method, dispatch: MemberDispatch.Instance },
        },
        { symbol: firstOwner, surface: firstOwner.filePath, space: SymbolSpace.Type },
        { symbol: secondOwner, surface: secondOwner.filePath, space: SymbolSpace.Type },
      ],
    })

    const first = facts.logicalBySymbolId.get(firstMember.id)
    const second = facts.logicalBySymbolId.get(secondMember.id)
    expect(first?.ownerId).toBe(facts.logicalBySymbolId.get(firstOwner.id)?.id)
    expect(second?.ownerId).toBe(facts.logicalBySymbolId.get(secondOwner.id)?.id)
    expect(first?.id).not.toBe(second?.id)
  })

  it('omits a member whose declared owner is absent', () => {
    const member = symbol('save', SymbolKind.Method, 2)
    const facts = buildLogicalDeclarationFacts({
      workspace: 'ws',
      declarations: [
        {
          symbol: member,
          surface: member.filePath,
          space: SymbolSpace.Value,
          ownerSymbolId: 'missing',
          memberSemantics: { kind: MemberKind.Method, dispatch: MemberDispatch.Instance },
        },
      ],
    })
    expect(facts.declarations).toEqual([])
  })

  it('omits an owner-required declaration when no owner was proven', () => {
    const member = symbol('save', SymbolKind.Method, 2)
    const facts = buildLogicalDeclarationFacts({
      workspace: 'ws',
      declarations: [
        {
          symbol: member,
          surface: member.filePath,
          space: SymbolSpace.Value,
          requiresOwner: true,
          memberSemantics: { kind: MemberKind.Method, dispatch: MemberDispatch.Instance },
        },
      ],
    })

    expect(facts.declarations).toEqual([])
    expect(facts.logicalBySymbolId.has(member.id)).toBe(false)
  })

  it('omits undefined optional evidence from declaration descriptors', () => {
    const declaration = createAdapterDeclarationDescriptor({
      symbol: symbol('save', SymbolKind.Method, 2),
      surface: 'ws:src/example.ts',
      space: SymbolSpace.Value,
      ownerSymbolId: undefined,
      requiresOwner: true,
      memberSemantics: undefined,
    })

    expect(declaration).not.toHaveProperty('ownerSymbolId')
    expect(declaration).not.toHaveProperty('memberSemantics')
  })

  it('deduplicates and orders hierarchy facts with matching steps', () => {
    const base = symbol('Base', SymbolKind.Class, 1)
    const child = symbol('Child', SymbolKind.Class, 3)
    const declarations = buildLogicalDeclarationFacts({
      workspace: 'ws',
      declarations: [
        { symbol: child, surface: child.filePath, space: SymbolSpace.Type },
        { symbol: base, surface: base.filePath, space: SymbolSpace.Type },
      ],
    })
    const facts = buildHierarchyReferenceFacts({
      logicalBySymbolId: declarations.logicalBySymbolId,
      hierarchy: [
        { childSymbolId: child.id, parentSymbolId: base.id, kind: 'extends', precedence: 1 },
        { childSymbolId: child.id, parentSymbolId: base.id, kind: 'extends', precedence: 1 },
      ],
    })
    expect(facts.hierarchy).toHaveLength(1)
    expect(facts.steps).toEqual([
      {
        fromId: facts.hierarchy[0]!.childId,
        toId: facts.hierarchy[0]!.parentId,
        kind: 'extends:1',
      },
    ])
  })

  describe('withEnclosingTypeParents', () => {
    it('pops scope when construct coordinates end so following top-level declarations have undefined parentId', () => {
      const cls = createSymbolNode({
        name: 'UserService',
        kind: SymbolKind.Class,
        filePath: 'ws:src/user.ts',
        line: 1,
        column: 0,
        endLine: 5,
        endColumn: 1,
      })
      const method = createSymbolNode({
        name: 'save',
        kind: SymbolKind.Method,
        filePath: 'ws:src/user.ts',
        line: 2,
        column: 2,
        endLine: 4,
        endColumn: 3,
      })
      const fn = createSymbolNode({
        name: 'helper',
        kind: SymbolKind.Function,
        filePath: 'ws:src/user.ts',
        line: 7,
        column: 0,
        endLine: 10,
        endColumn: 1,
      })

      const resolved = withEnclosingTypeParents([cls, method, fn])
      const resMethod = resolved.find((s) => s.name === 'save')
      const resFn = resolved.find((s) => s.name === 'helper')

      expect(resMethod?.parentId).toBe(cls.id)
      expect(resFn?.parentId).toBeUndefined()
    })

    it('assigns container parent to properties and methods, and routine parent to local variables', () => {
      const cls = createSymbolNode({
        name: 'Repository',
        kind: SymbolKind.Class,
        filePath: 'ws:src/repo.ts',
        line: 1,
        column: 0,
        endLine: 15,
        endColumn: 1,
      })
      const prop = createSymbolNode({
        name: 'db',
        kind: SymbolKind.Property,
        filePath: 'ws:src/repo.ts',
        line: 2,
        column: 2,
        endLine: 2,
        endColumn: 10,
      })
      const method = createSymbolNode({
        name: 'find',
        kind: SymbolKind.Method,
        filePath: 'ws:src/repo.ts',
        line: 4,
        column: 2,
        endLine: 10,
        endColumn: 3,
      })
      const local = createSymbolNode({
        name: 'query',
        kind: SymbolKind.Variable,
        filePath: 'ws:src/repo.ts',
        line: 5,
        column: 4,
        endLine: 5,
        endColumn: 20,
      })

      const resolved = withEnclosingTypeParents([cls, prop, method, local])
      const resProp = resolved.find((s) => s.name === 'db')
      const resMethod = resolved.find((s) => s.name === 'find')
      const resLocal = resolved.find((s) => s.name === 'query')

      expect(resProp?.parentId).toBe(cls.id)
      expect(resMethod?.parentId).toBe(cls.id)
      expect(resLocal?.parentId).toBe(method.id)
    })
  })

  describe('findContainingCallableSymbol', () => {
    const policy: CallableContainmentPolicy = {
      callableKinds: new Set([SymbolKind.Function, SymbolKind.Method]),
    }

    it('selects containing function over a closer preceding non-callable', () => {
      const fn = createSymbolNode({
        name: 'doWork',
        kind: SymbolKind.Function,
        filePath: 'ws:src/work.ts',
        line: 1,
        column: 0,
        endLine: 10,
        endColumn: 1,
      })
      const variable = createSymbolNode({
        name: 'local',
        kind: SymbolKind.Variable,
        filePath: 'ws:src/work.ts',
        line: 3,
        column: 2,
        endLine: 3,
        endColumn: 15,
      })

      const caller = findContainingCallableSymbol([fn, variable], { line: 5, column: 4 }, policy)
      expect(caller?.id).toBe(fn.id)
    })

    it('selects the correct callable on same line using column coordinates', () => {
      const fn1 = createSymbolNode({
        name: 'first',
        kind: SymbolKind.Function,
        filePath: 'ws:src/same.ts',
        line: 1,
        column: 0,
        endLine: 1,
        endColumn: 15,
      })
      const fn2 = createSymbolNode({
        name: 'second',
        kind: SymbolKind.Function,
        filePath: 'ws:src/same.ts',
        line: 1,
        column: 20,
        endLine: 1,
        endColumn: 40,
      })

      const caller = findContainingCallableSymbol([fn1, fn2], { line: 1, column: 25 }, policy)
      expect(caller?.id).toBe(fn2.id)
    })

    it('selects innermost nested callable', () => {
      const outer = createSymbolNode({
        name: 'outer',
        kind: SymbolKind.Function,
        filePath: 'ws:src/nested.ts',
        line: 1,
        column: 0,
        endLine: 20,
        endColumn: 1,
      })
      const inner = createSymbolNode({
        name: 'inner',
        kind: SymbolKind.Function,
        filePath: 'ws:src/nested.ts',
        line: 5,
        column: 2,
        endLine: 10,
        endColumn: 3,
      })

      const caller = findContainingCallableSymbol([outer, inner], { line: 7, column: 4 }, policy)
      expect(caller?.id).toBe(inner.id)
    })

    it('returns undefined when call is outside every eligible callable', () => {
      const fn = createSymbolNode({
        name: 'past',
        kind: SymbolKind.Function,
        filePath: 'ws:src/past.ts',
        line: 1,
        column: 0,
        endLine: 5,
        endColumn: 1,
      })

      const caller = findContainingCallableSymbol([fn], { line: 7, column: 0 }, policy)
      expect(caller).toBeUndefined()
    })

    it('honors half-open boundaries: includes start position, excludes exact end position', () => {
      const fn = createSymbolNode({
        name: 'boundary',
        kind: SymbolKind.Function,
        filePath: 'ws:src/boundary.ts',
        line: 10,
        column: 5,
        endLine: 20,
        endColumn: 15,
      })

      // Exactly at start -> contained
      expect(findContainingCallableSymbol([fn], { line: 10, column: 5 }, policy)?.id).toBe(fn.id)
      // Inside -> contained
      expect(findContainingCallableSymbol([fn], { line: 15, column: 0 }, policy)?.id).toBe(fn.id)
      // One column before end -> contained
      expect(findContainingCallableSymbol([fn], { line: 20, column: 14 }, policy)?.id).toBe(fn.id)
      // Exactly at endLine, endColumn -> half-open, NOT contained
      expect(findContainingCallableSymbol([fn], { line: 20, column: 15 }, policy)).toBeUndefined()
      // Past end -> NOT contained
      expect(findContainingCallableSymbol([fn], { line: 20, column: 16 }, policy)).toBeUndefined()
      // Before start -> NOT contained
      expect(findContainingCallableSymbol([fn], { line: 10, column: 4 }, policy)).toBeUndefined()
    })

    it('resolves between same-line sibling callables to undefined without falling back to previous', () => {
      const leftFn = createSymbolNode({
        name: 'left',
        kind: SymbolKind.Function,
        filePath: 'ws:src/same.ts',
        line: 1,
        column: 0,
        endLine: 1,
        endColumn: 10,
      })
      const rightFn = createSymbolNode({
        name: 'right',
        kind: SymbolKind.Function,
        filePath: 'ws:src/same.ts',
        line: 1,
        column: 20,
        endLine: 1,
        endColumn: 30,
      })

      // Inside left
      expect(
        findContainingCallableSymbol([leftFn, rightFn], { line: 1, column: 5 }, policy)?.id,
      ).toBe(leftFn.id)
      // Between left and right -> MUST return undefined, NOT leftFn
      expect(
        findContainingCallableSymbol([leftFn, rightFn], { line: 1, column: 15 }, policy),
      ).toBeUndefined()
      // Inside right
      expect(
        findContainingCallableSymbol([leftFn, rightFn], { line: 1, column: 25 }, policy)?.id,
      ).toBe(rightFn.id)
    })

    it('selects innermost across 3 levels of nesting', () => {
      const outer = createSymbolNode({
        name: 'outer',
        kind: SymbolKind.Function,
        filePath: 'ws:src/nested.ts',
        line: 1,
        column: 0,
        endLine: 30,
        endColumn: 1,
      })
      const middle = createSymbolNode({
        name: 'middle',
        kind: SymbolKind.Function,
        filePath: 'ws:src/nested.ts',
        line: 5,
        column: 2,
        endLine: 25,
        endColumn: 3,
      })
      const inner = createSymbolNode({
        name: 'inner',
        kind: SymbolKind.Function,
        filePath: 'ws:src/nested.ts',
        line: 10,
        column: 4,
        endLine: 15,
        endColumn: 5,
      })

      const all = [outer, middle, inner]
      expect(findContainingCallableSymbol(all, { line: 12, column: 6 }, policy)?.id).toBe(inner.id)
      expect(findContainingCallableSymbol(all, { line: 8, column: 4 }, policy)?.id).toBe(middle.id)
      expect(findContainingCallableSymbol(all, { line: 2, column: 2 }, policy)?.id).toBe(outer.id)
    })

    it('respects eligibleSymbolIds policy to exclude non-eligible callables', () => {
      const fn1 = createSymbolNode({
        name: 'excluded',
        kind: SymbolKind.Function,
        filePath: 'ws:src/policy.ts',
        line: 1,
        column: 0,
        endLine: 20,
        endColumn: 1,
      })
      const fn2 = createSymbolNode({
        name: 'included',
        kind: SymbolKind.Function,
        filePath: 'ws:src/policy.ts',
        line: 5,
        column: 2,
        endLine: 15,
        endColumn: 3,
      })

      const restrictedPolicy: CallableContainmentPolicy = {
        callableKinds: new Set([SymbolKind.Function]),
        eligibleSymbolIds: new Set([fn1.id]),
      }

      // Inside fn2, but fn2 is not in eligibleSymbolIds -> falls through to fn1
      expect(
        findContainingCallableSymbol([fn1, fn2], { line: 8, column: 4 }, restrictedPolicy)?.id,
      ).toBe(fn1.id)
    })
  })

  describe('declaration classification and overload grouping in buildLogicalDeclarationFacts', () => {
    it('filters physical-only and lexical-binding descriptors from logical symbols', () => {
      const physical = createSymbolNode({
        name: 'rawId',
        kind: SymbolKind.Variable,
        filePath: 'ws:src/test.ts',
        line: 1,
        column: 0,
        endLine: 1,
        endColumn: 10,
      })
      const lexical = createSymbolNode({
        name: 'param',
        kind: SymbolKind.Variable,
        filePath: 'ws:src/test.ts',
        line: 2,
        column: 0,
        endLine: 2,
        endColumn: 10,
      })

      const facts = buildLogicalDeclarationFacts({
        workspace: 'ws',
        declarations: [
          createPhysicalOnlyDeclarationDescriptor({ symbol: physical, reason: 'unsupported' }),
          createLexicalBindingDeclarationDescriptor({
            symbol: lexical,
            scopeId: 'scope1',
            space: SymbolSpace.Value,
            reason: 'local parameter',
          }),
        ],
      })

      expect(facts.declarations).toEqual([])
      expect(facts.logicalBySymbolId.size).toBe(0)
    })

    it('groups overloads with identical canonical identity and groupKey, preserving occurrence form', () => {
      const sig = createSymbolNode({
        name: 'query',
        kind: SymbolKind.Function,
        filePath: 'ws:src/fn.ts',
        line: 1,
        column: 0,
        endLine: 1,
        endColumn: 30,
      })
      const def = createSymbolNode({
        name: 'query',
        kind: SymbolKind.Function,
        filePath: 'ws:src/fn.ts',
        line: 3,
        column: 0,
        endLine: 5,
        endColumn: 1,
      })

      const facts = buildLogicalDeclarationFacts({
        workspace: 'ws',
        declarations: [
          createAdapterDeclarationDescriptor({
            symbol: sig,
            surface: 'ws:src/fn.ts',
            space: SymbolSpace.Value,
            ownerSymbolId: undefined,
            requiresOwner: false,
            memberSemantics: undefined,
            occurrenceForm: DeclarationOccurrenceForm.Signature,
            groupKey: 'query-overload',
          }),
          createAdapterDeclarationDescriptor({
            symbol: def,
            surface: 'ws:src/fn.ts',
            space: SymbolSpace.Value,
            ownerSymbolId: undefined,
            requiresOwner: false,
            memberSemantics: undefined,
            occurrenceForm: DeclarationOccurrenceForm.Definition,
            groupKey: 'query-overload',
          }),
        ],
      })

      expect(facts.logicalBySymbolId.get(sig.id)?.id).toBe(facts.logicalBySymbolId.get(def.id)?.id)
      expect(facts.declarations).toHaveLength(2)
      const sigDecl = facts.declarations.find((d) => d.symbolId === sig.id)
      const defDecl = facts.declarations.find((d) => d.symbolId === def.id)
      expect(sigDecl?.form).toBe(DeclarationOccurrenceForm.Signature)
      expect(defDecl?.form).toBe(DeclarationOccurrenceForm.Definition)
      expect(facts.diagnostics).toEqual([])
    })

    it.each([
      ['missing', undefined],
      ['empty', ''],
    ] as const)(
      'does not group canonical collisions when the group key is %s',
      (_label, groupKey) => {
        const first = createSymbolNode({
          name: 'sameName',
          kind: SymbolKind.Function,
          filePath: 'ws:src/ungrouped.ts',
          line: 1,
          column: 0,
          endLine: 1,
          endColumn: 20,
        })
        const second = createSymbolNode({
          name: 'sameName',
          kind: SymbolKind.Function,
          filePath: 'ws:src/ungrouped.ts',
          line: 3,
          column: 0,
          endLine: 3,
          endColumn: 20,
        })

        const descriptor = (symbol: typeof first) =>
          createAdapterDeclarationDescriptor({
            symbol,
            surface: 'ws:src/ungrouped.ts',
            space: SymbolSpace.Value,
            ownerSymbolId: undefined,
            requiresOwner: false,
            memberSemantics: undefined,
            ...(groupKey === undefined ? {} : { groupKey }),
          })
        const facts = buildLogicalDeclarationFacts({
          workspace: 'ws',
          declarations: [descriptor(first), descriptor(second)],
        })

        expect(facts.logicalBySymbolId.size).toBe(0)
        expect(facts.declarations).toEqual([])
        expect(facts.diagnostics).toEqual([
          {
            code: 'UNGROUPED_LOGICAL_COLLISION',
            logicalId: expect.stringContaining('sameName'),
            symbolIds: [first.id, second.id].sort(),
          },
        ])
      },
    )

    it('keeps same-name nested declarations distinct through their logical owners', () => {
      const leftOwner = symbol('Left', SymbolKind.Class, 1)
      const rightOwner = symbol('Right', SymbolKind.Class, 10)
      const leftMember = symbol('run', SymbolKind.Method, 2)
      const rightMember = symbol('run', SymbolKind.Method, 11)
      const logical = (item: typeof leftOwner, ownerSymbolId?: string) =>
        createAdapterDeclarationDescriptor({
          symbol: item,
          surface: 'ws:src/nested.ts',
          space: SymbolSpace.Value,
          ownerSymbolId,
          requiresOwner: ownerSymbolId !== undefined,
          memberSemantics: undefined,
        })

      const facts = buildLogicalDeclarationFacts({
        workspace: 'ws',
        declarations: [
          logical(leftOwner),
          logical(rightOwner),
          logical(leftMember, leftOwner.id),
          logical(rightMember, rightOwner.id),
        ],
      })

      expect(facts.logicalBySymbolId.get(leftMember.id)?.id).not.toBe(
        facts.logicalBySymbolId.get(rightMember.id)?.id,
      )
      expect(facts.declarations).toHaveLength(4)
      expect(facts.diagnostics).toEqual([])
    })

    it('rejects mismatched groupKey and omits conflicting logical mapping', () => {
      const first = createSymbolNode({
        name: 'sameName',
        kind: SymbolKind.Function,
        filePath: 'ws:src/conflict.ts',
        line: 1,
        column: 0,
        endLine: 1,
        endColumn: 20,
      })
      const second = createSymbolNode({
        name: 'sameName',
        kind: SymbolKind.Function,
        filePath: 'ws:src/conflict.ts',
        line: 3,
        column: 0,
        endLine: 3,
        endColumn: 20,
      })

      const facts = buildLogicalDeclarationFacts({
        workspace: 'ws',
        declarations: [
          createAdapterDeclarationDescriptor({
            symbol: first,
            surface: 'ws:src/conflict.ts',
            space: SymbolSpace.Value,
            ownerSymbolId: undefined,
            requiresOwner: false,
            memberSemantics: undefined,
            groupKey: 'keyA',
          }),
          createAdapterDeclarationDescriptor({
            symbol: second,
            surface: 'ws:src/conflict.ts',
            space: SymbolSpace.Value,
            ownerSymbolId: undefined,
            requiresOwner: false,
            memberSemantics: undefined,
            groupKey: 'keyB',
          }),
        ],
      })

      expect(facts.logicalBySymbolId.has(first.id)).toBe(false)
      expect(facts.logicalBySymbolId.has(second.id)).toBe(false)
      expect(facts.declarations).toEqual([])
      expect(facts.diagnostics).toEqual([
        {
          code: 'CONFLICTING_DECLARATION_GROUP',
          logicalId: expect.stringContaining('sameName'),
          symbolIds: [first.id, second.id].sort(),
        },
      ])
    })
  })
})

describe('createImportedHierarchyMetadata', () => {
  it('copies the clause range verbatim and records import provenance', () => {
    const clauseRange = { startLine: 3, startColumn: 18, endLine: 3, endColumn: 22 }

    expect(
      createImportedHierarchyMetadata({
        clauseRange,
        precedence: 1,
        requestedName: 'Base',
        resolvedTargetSymbolId: 'ws:base.ts:class:Base:1:0',
      }),
    ).toEqual({
      precedence: 1,
      sourceRange: clauseRange,
      importProvenance: {
        kind: 'import',
        requestedName: 'Base',
        resolvedTargetSymbolId: 'ws:base.ts:class:Base:1:0',
      },
    })
  })
})

describe('createDeclarationSymbolIndex', () => {
  it('handles empty symbol inputs with size 0 and returns undefined for lookups', () => {
    const index = createDeclarationSymbolIndex([])
    expect(index.size).toBe(0)
    expect(index.find(SymbolKind.Method, 'test', 1, 0)).toBeUndefined()
  })

  it('matches exact kind, name, line, and column and misses on any dimension difference', () => {
    const target = createSymbolNode({
      name: 'processItem',
      kind: SymbolKind.Method,
      filePath: 'ws:src/service.ts',
      line: 10,
      column: 4,
      endLine: 20,
      endColumn: 5,
    })
    const sibling = createSymbolNode({
      name: 'processItem',
      kind: SymbolKind.Method,
      filePath: 'ws:src/service.ts',
      line: 30,
      column: 4,
      endLine: 40,
      endColumn: 5,
    })
    const functionWithSameName = createSymbolNode({
      name: 'processItem',
      kind: SymbolKind.Function,
      filePath: 'ws:src/service.ts',
      line: 10,
      column: 4,
      endLine: 20,
      endColumn: 5,
    })

    const index = createDeclarationSymbolIndex([target, sibling, functionWithSameName])
    expect(index.size).toBe(3)

    // Exact matches
    expect(index.find(SymbolKind.Method, 'processItem', 10, 4)?.id).toBe(target.id)
    expect(index.find(SymbolKind.Method, 'processItem', 30, 4)?.id).toBe(sibling.id)
    expect(index.find(SymbolKind.Function, 'processItem', 10, 4)?.id).toBe(functionWithSameName.id)

    // Misses
    expect(index.find(SymbolKind.Method, 'processItem', 10, 5)).toBeUndefined() // wrong column
    expect(index.find(SymbolKind.Method, 'processItem', 11, 4)).toBeUndefined() // wrong line
    expect(index.find(SymbolKind.Method, 'other', 10, 4)).toBeUndefined() // wrong name
    expect(index.find(SymbolKind.Class, 'processItem', 10, 4)).toBeUndefined() // wrong kind
  })

  it('resolves duplicate exact keys deterministically by lowest symbol ID', () => {
    // Both symbols have identical kind, name, line, and column, but different IDs
    const symB = createSymbolNode({
      name: 'duplicate',
      kind: SymbolKind.Method,
      filePath: 'ws:src/b.ts',
      line: 5,
      column: 2,
    })
    const symA = createSymbolNode({
      name: 'duplicate',
      kind: SymbolKind.Method,
      filePath: 'ws:src/a.ts',
      line: 5,
      column: 2,
    })

    const [lower, higher] = [symA, symB].sort((x, y) => x.id.localeCompare(y.id))

    // Test insertion order 1: [higher, lower]
    const index1 = createDeclarationSymbolIndex([higher!, lower!])
    expect(index1.find(SymbolKind.Method, 'duplicate', 5, 2)?.id).toBe(lower!.id)

    // Test insertion order 2: [lower, higher]
    const index2 = createDeclarationSymbolIndex([lower!, higher!])
    expect(index2.find(SymbolKind.Method, 'duplicate', 5, 2)?.id).toBe(lower!.id)
  })

  it('records build and lookup events in the optional observer', () => {
    const recorded: StructuralWorkKind[] = []
    const observer: StructuralWorkObserver = {
      record: (kind) => recorded.push(kind),
    }

    const sym1 = createSymbolNode({
      name: 'alpha',
      kind: SymbolKind.Function,
      filePath: 'ws:src/test.ts',
      line: 1,
      column: 0,
    })
    const sym2 = createSymbolNode({
      name: 'beta',
      kind: SymbolKind.Function,
      filePath: 'ws:src/test.ts',
      line: 10,
      column: 0,
    })

    const index = createDeclarationSymbolIndex([sym1, sym2], observer)
    expect(recorded).toEqual(['declaration-symbol-indexed', 'declaration-symbol-indexed'])

    index.find(SymbolKind.Function, 'alpha', 1, 0)
    index.find(SymbolKind.Function, 'gamma', 20, 0)
    expect(recorded).toEqual([
      'declaration-symbol-indexed',
      'declaration-symbol-indexed',
      'declaration-symbol-lookup',
      'declaration-symbol-lookup',
    ])
  })
})

describe('createCallableContainmentIndex parity with findContainingCallableSymbol', () => {
  const policy: CallableContainmentPolicy = {
    callableKinds: new Set([SymbolKind.Function, SymbolKind.Method]),
  }

  it('matches across empty symbols, missing ends, policy filtering, and boundary positions', () => {
    const fn1 = createSymbolNode({
      name: 'outer',
      kind: SymbolKind.Function,
      filePath: 'ws:src/sample.ts',
      line: 10,
      column: 0,
      endLine: 50,
      endColumn: 1,
    })
    const fn2 = createSymbolNode({
      name: 'inner',
      kind: SymbolKind.Function,
      filePath: 'ws:src/sample.ts',
      line: 20,
      column: 4,
      endLine: 30,
      endColumn: 5,
    })
    const sibling = createSymbolNode({
      name: 'sibling',
      kind: SymbolKind.Method,
      filePath: 'ws:src/sample.ts',
      line: 60,
      column: 0,
      endLine: 70,
      endColumn: 0,
    })
    const missingEnd = createSymbolNode({
      name: 'incomplete',
      kind: SymbolKind.Function,
      filePath: 'ws:src/sample.ts',
      line: 80,
      column: 0,
    })
    const nonCallable = createSymbolNode({
      name: 'NotCallable',
      kind: SymbolKind.Class,
      filePath: 'ws:src/sample.ts',
      line: 5,
      column: 0,
      endLine: 90,
      endColumn: 0,
    })

    const symbols = [fn1, fn2, sibling, missingEnd, nonCallable]
    const index = createCallableContainmentIndex(symbols, policy)

    const testPositions = [
      { line: 5, column: 0 }, // inside class only -> undefined
      { line: 10, column: 0 }, // exact start of fn1 -> fn1
      { line: 15, column: 2 }, // inside fn1, outside fn2 -> fn1
      { line: 20, column: 4 }, // exact start of fn2 -> fn2
      { line: 25, column: 10 }, // inside fn2 -> fn2
      { line: 30, column: 4 }, // before end of fn2 -> fn2
      { line: 30, column: 5 }, // exact end of fn2 -> fn1 (outer)
      { line: 40, column: 0 }, // inside fn1 -> fn1
      { line: 50, column: 0 }, // inside fn1 -> fn1
      { line: 50, column: 1 }, // exact end of fn1 -> undefined
      { line: 55, column: 0 }, // gap -> undefined
      { line: 60, column: 0 }, // exact start of sibling -> sibling
      { line: 70, column: 0 }, // exact end of sibling -> undefined
      { line: 85, column: 0 }, // inside incomplete -> undefined
      { line: 100, column: 0 }, // past all -> undefined
    ]

    for (const pos of testPositions) {
      const fromLegacy = findContainingCallableSymbol(symbols, pos, policy)
      const fromIndex = index.find(pos)
      expect(fromIndex?.id).toBe(fromLegacy?.id)
    }
  })

  it('breaks ties on equal ranges by lowest symbol ID identically', () => {
    const sym1 = createSymbolNode({
      name: 'first',
      kind: SymbolKind.Function,
      filePath: 'ws:src/tie.ts',
      line: 10,
      column: 0,
      endLine: 20,
      endColumn: 0,
    })
    const sym2 = createSymbolNode({
      name: 'second',
      kind: SymbolKind.Function,
      filePath: 'ws:src/tie.ts',
      line: 10,
      column: 0,
      endLine: 20,
      endColumn: 0,
    })

    const symbols = [sym1, sym2]
    const index = createCallableContainmentIndex(symbols, policy)
    const pos = { line: 15, column: 0 }

    const legacy = findContainingCallableSymbol(symbols, pos, policy)
    const indexed = index.find(pos)

    expect(indexed?.id).toBe(legacy?.id)
  })

  it('respects eligibleSymbolIds restriction identically', () => {
    const fnA = createSymbolNode({
      name: 'fnA',
      kind: SymbolKind.Function,
      filePath: 'ws:src/a.ts',
      line: 10,
      column: 0,
      endLine: 20,
      endColumn: 0,
    })
    const fnB = createSymbolNode({
      name: 'fnB',
      kind: SymbolKind.Function,
      filePath: 'ws:src/a.ts',
      line: 30,
      column: 0,
      endLine: 40,
      endColumn: 0,
    })

    const restrictedPolicy: CallableContainmentPolicy = {
      callableKinds: new Set([SymbolKind.Function]),
      eligibleSymbolIds: new Set([fnB.id]),
    }

    const symbols = [fnA, fnB]
    const index = createCallableContainmentIndex(symbols, restrictedPolicy)

    expect(index.find({ line: 15, column: 0 })).toBeUndefined()
    expect(index.find({ line: 35, column: 0 })?.id).toBe(fnB.id)

    expect(
      findContainingCallableSymbol(symbols, { line: 15, column: 0 }, restrictedPolicy),
    ).toBeUndefined()
    expect(
      findContainingCallableSymbol(symbols, { line: 35, column: 0 }, restrictedPolicy)?.id,
    ).toBe(fnB.id)
  })
})

describe('createCallableContainmentIndex bounded work counter', () => {
  it('indexes eligible symbols once during build and never reindexes during queries', () => {
    const counts = new Map<StructuralWorkKind, number>()
    const observer: StructuralWorkObserver = {
      record: (kind) => {
        counts.set(kind, (counts.get(kind) ?? 0) + 1)
      },
    }

    const callableSymbols = Array.from({ length: 50 }, (_, i) =>
      createSymbolNode({
        name: `func_${i}`,
        kind: SymbolKind.Function,
        filePath: 'ws:src/scale.ts',
        line: i * 10 + 1,
        column: 0,
        endLine: i * 10 + 9,
        endColumn: 0,
      }),
    )

    const nonCallable = createSymbolNode({
      name: 'MyClass',
      kind: SymbolKind.Class,
      filePath: 'ws:src/scale.ts',
      line: 1,
      column: 0,
      endLine: 600,
      endColumn: 0,
    })

    const policy: CallableContainmentPolicy = {
      callableKinds: new Set([SymbolKind.Function]),
    }

    // Build index with 50 eligible + 1 ineligible symbol
    const index = createCallableContainmentIndex(
      [...callableSymbols, nonCallable],
      policy,
      observer,
    )

    expect(index.size).toBe(50)
    expect(counts.get('callable-symbol-indexed')).toBe(50)

    const indexedCountBeforeQueries = counts.get('callable-symbol-indexed')

    // Perform 20 queries at various positions
    for (let q = 0; q < 20; q++) {
      index.find({ line: q * 10 + 3, column: 5 })
    }

    // Proves that queries do NOT re-index eligible symbols or rebuild tree
    expect(counts.get('callable-symbol-indexed')).toBe(indexedCountBeforeQueries)
    // Proves that interval tree visits were recorded during queries
    expect(counts.get('callable-interval-visited') ?? 0).toBeGreaterThan(0)
  })

  it('Task 7.3: synthetic scaling evidence across 50/100/200/400 size inputs', () => {
    const sizes = [50, 100, 200, 400] as const
    const policy: CallableContainmentPolicy = {
      callableKinds: new Set([SymbolKind.Function]),
    }

    for (const size of sizes) {
      const counts = new Map<StructuralWorkKind, number>()
      const observer: StructuralWorkObserver = {
        record: (kind) => {
          counts.set(kind, (counts.get(kind) ?? 0) + 1)
        },
      }

      const symbols = Array.from({ length: size }, (_, i) =>
        createSymbolNode({
          name: `func_${i}`,
          kind: SymbolKind.Function,
          filePath: 'ws:src/scale.ts',
          line: i * 10 + 1,
          column: 0,
          endLine: i * 10 + 9,
          endColumn: 0,
        }),
      )

      // 1. DeclarationSymbolIndex build: exact size
      const declIndex = createDeclarationSymbolIndex(symbols, observer)
      expect(declIndex.size).toBe(size)
      expect(counts.get('declaration-symbol-indexed')).toBe(size)

      // 2. CallableContainmentIndex build: exact size
      const callableIndex = createCallableContainmentIndex(symbols, policy, observer)
      expect(callableIndex.size).toBe(size)
      expect(counts.get('callable-symbol-indexed')).toBe(size)

      // 3. Execute 2 * size queries
      for (let q = 0; q < size * 2; q++) {
        declIndex.find(SymbolKind.Function, `func_${q % size}`, (q % size) * 10 + 1, 0)
        callableIndex.find({ line: (q % size) * 10 + 3, column: 5 })
      }

      // Assert index-build counts scale strictly with indexed structures (O(N)) and DO NOT multiply with queries
      expect(counts.get('declaration-symbol-indexed')).toBe(size)
      expect(counts.get('callable-symbol-indexed')).toBe(size)
    }
  })
})
