import { describe, expect, it } from 'vitest'
import { createSymbolNode } from '../../../src/domain/value-objects/symbol-node.js'
import { SymbolKind } from '../../../src/domain/value-objects/symbol-kind.js'
import {
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
  withEnclosingTypeParents,
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
})
