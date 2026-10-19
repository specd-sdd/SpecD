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
  createImportedHierarchyMetadata,
  createPhysicalOnlyDeclarationDescriptor,
  createLexicalBindingDeclarationDescriptor,
  findContainingCallableSymbol,
  withEnclosingTypeParents,
  type CallableContainmentPolicy,
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
