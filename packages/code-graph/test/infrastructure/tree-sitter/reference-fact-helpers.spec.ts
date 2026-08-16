import { describe, expect, it } from 'vitest'
import { createSymbolNode } from '../../../src/domain/value-objects/symbol-node.js'
import { SymbolKind } from '../../../src/domain/value-objects/symbol-kind.js'
import { MemberForm, SymbolSpace } from '../../../src/domain/value-objects/symbol-reference.js'
import {
  buildHierarchyReferenceFacts,
  buildLogicalDeclarationFacts,
  containsSymbolRange,
  createAdapterDeclarationDescriptor,
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
          memberForm: MemberForm.Instance,
        },
        {
          symbol: secondMember,
          surface: secondMember.filePath,
          space: SymbolSpace.Value,
          ownerSymbolId: secondOwner.id,
          memberForm: MemberForm.Instance,
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
          memberForm: MemberForm.Instance,
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
          memberForm: MemberForm.Instance,
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
      memberForm: undefined,
    })

    expect(declaration).not.toHaveProperty('ownerSymbolId')
    expect(declaration).not.toHaveProperty('memberForm')
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
})
