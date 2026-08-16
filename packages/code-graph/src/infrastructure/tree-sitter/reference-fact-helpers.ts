import { type SymbolNode } from '../../domain/value-objects/symbol-node.js'
import {
  createLogicalSymbol,
  type DeclarationOccurrence,
  type HierarchyFact,
  type LogicalSymbol,
  type MemberForm,
  type ResolutionStep,
  type SymbolSpace,
} from '../../domain/value-objects/symbol-reference.js'

/** Describes one syntax-proven declaration before logical identity is constructed. */
export interface AdapterDeclarationDescriptor {
  readonly symbol: SymbolNode
  readonly surface: string
  readonly space: SymbolSpace
  readonly ownerSymbolId?: string
  readonly requiresOwner?: boolean
  readonly memberForm?: MemberForm
}

/**
 * Creates a declaration descriptor while omitting unproven optional evidence.
 * @param input - Syntax-proven declaration dimensions.
 * @param input.symbol - Extracted declaration symbol.
 * @param input.surface - Semantic module or package surface.
 * @param input.space - Proven symbol space.
 * @param input.ownerSymbolId - Extracted owner identity, when proven.
 * @param input.requiresOwner - Whether logical projection requires an owner.
 * @param input.memberForm - Proven member form, when applicable.
 * @returns Exact-optional-property-safe declaration descriptor.
 */
export function createAdapterDeclarationDescriptor(input: {
  readonly symbol: SymbolNode
  readonly surface: string
  readonly space: SymbolSpace
  readonly ownerSymbolId: string | undefined
  readonly requiresOwner: boolean
  readonly memberForm: MemberForm | undefined
}): AdapterDeclarationDescriptor {
  return {
    symbol: input.symbol,
    surface: input.surface,
    space: input.space,
    requiresOwner: input.requiresOwner,
    ...(input.ownerSymbolId === undefined ? {} : { ownerSymbolId: input.ownerSymbolId }),
    ...(input.memberForm === undefined ? {} : { memberForm: input.memberForm }),
  }
}

/** Describes one syntax-proven owner hierarchy edge using extracted symbol IDs. */
export interface AdapterHierarchyDescriptor {
  readonly childSymbolId: string
  readonly parentSymbolId: string
  readonly kind: string
  readonly precedence: number
}

/** Logical declaration projection shared by built-in language adapters. */
export interface LogicalDeclarationFacts {
  readonly declarations: readonly DeclarationOccurrence[]
  readonly logicalBySymbolId: ReadonlyMap<string, LogicalSymbol>
}

/** Hierarchy projection shared by built-in language adapters. */
export interface HierarchyReferenceFacts {
  readonly hierarchy: readonly HierarchyFact[]
  readonly steps: readonly ResolutionStep[]
}

/**
 * Tests whether one complete declaration construct contains another.
 * @param owner - Candidate enclosing declaration.
 * @param member - Candidate nested declaration.
 * @returns Whether both complete ranges prove containment.
 */
export function containsSymbolRange(owner: SymbolNode, member: SymbolNode): boolean {
  if (
    owner.id === member.id ||
    owner.filePath !== member.filePath ||
    owner.endLine === undefined ||
    owner.endColumn === undefined ||
    member.endLine === undefined ||
    member.endColumn === undefined
  ) {
    return false
  }
  return (
    comparePosition(owner.line, owner.column, member.line, member.column) <= 0 &&
    comparePosition(member.endLine, member.endColumn, owner.endLine, owner.endColumn) <= 0
  )
}

/**
 * Builds logical declarations in two passes so members reference logical owners.
 * Descriptors whose declared owner is missing or cyclic are conservatively omitted.
 * @param input - Workspace and syntax-proven declaration descriptors.
 * @param input.workspace - Workspace owning the declarations.
 * @param input.declarations - Syntax-proven declarations to materialize.
 * @returns Logical declarations and the extracted-symbol-to-logical-symbol map.
 */
export function buildLogicalDeclarationFacts(input: {
  readonly workspace: string
  readonly declarations: readonly AdapterDeclarationDescriptor[]
}): LogicalDeclarationFacts {
  const descriptors = new Map(input.declarations.map((item) => [item.symbol.id, item]))
  const logicalBySymbolId = new Map<string, LogicalSymbol>()
  const visiting = new Set<string>()

  const materialize = (symbolId: string): LogicalSymbol | undefined => {
    const existing = logicalBySymbolId.get(symbolId)
    if (existing) return existing
    const descriptor = descriptors.get(symbolId)
    if (!descriptor || visiting.has(symbolId)) return undefined
    if (descriptor.requiresOwner === true && descriptor.ownerSymbolId === undefined) {
      return undefined
    }

    visiting.add(symbolId)
    const owner = descriptor.ownerSymbolId ? materialize(descriptor.ownerSymbolId) : undefined
    visiting.delete(symbolId)
    if (descriptor.ownerSymbolId && !owner) return undefined

    const logical = createLogicalSymbol({
      workspace: input.workspace,
      surface: descriptor.surface,
      name: descriptor.symbol.name,
      space: descriptor.space,
      ownerId: owner?.id,
      memberForm: descriptor.memberForm,
    })
    logicalBySymbolId.set(symbolId, logical)
    return logical
  }

  for (const descriptor of input.declarations) materialize(descriptor.symbol.id)

  const declarations = input.declarations
    .flatMap((descriptor): DeclarationOccurrence[] => {
      const logical = logicalBySymbolId.get(descriptor.symbol.id)
      if (!logical) return []
      return [
        {
          logicalId: logical.id,
          symbolId: descriptor.symbol.id,
          location: {
            filePath: descriptor.symbol.filePath,
            line: descriptor.symbol.line,
            column: descriptor.symbol.column,
            endLine: descriptor.symbol.endLine,
            endColumn: descriptor.symbol.endColumn,
          },
          kind: descriptor.symbol.kind,
        },
      ]
    })
    .sort(compareDeclarations)

  return { declarations, logicalBySymbolId }
}

/**
 * Converts syntax-level owner edges into deterministic logical hierarchy evidence.
 * Edges whose child or parent declaration was omitted are conservatively dropped.
 * @param input - Syntax edges and the logical declaration map.
 * @param input.hierarchy - Syntax-proven hierarchy descriptors.
 * @param input.logicalBySymbolId - Extracted-symbol-to-logical-symbol map.
 * @returns Deduplicated hierarchy facts and matching traversal steps.
 */
export function buildHierarchyReferenceFacts(input: {
  readonly hierarchy: readonly AdapterHierarchyDescriptor[]
  readonly logicalBySymbolId: ReadonlyMap<string, LogicalSymbol>
}): HierarchyReferenceFacts {
  const facts = new Map<string, HierarchyFact>()
  for (const descriptor of input.hierarchy) {
    const child = input.logicalBySymbolId.get(descriptor.childSymbolId)
    const parent = input.logicalBySymbolId.get(descriptor.parentSymbolId)
    if (!child || !parent) continue
    const fact: HierarchyFact = {
      childId: child.id,
      parentId: parent.id,
      kind: descriptor.kind,
      precedence: descriptor.precedence,
    }
    facts.set(JSON.stringify([fact.childId, fact.parentId, fact.kind, fact.precedence]), fact)
  }

  const hierarchy = [...facts.values()].sort(compareHierarchyFacts)
  const steps = hierarchy.map(
    (fact): ResolutionStep => ({
      fromId: fact.childId,
      toId: fact.parentId,
      kind: `${fact.kind}:${String(fact.precedence)}`,
    }),
  )
  return { hierarchy, steps }
}

/**
 * Orders declaration occurrences independently from adapter traversal order.
 * @param left - Left declaration.
 * @param right - Right declaration.
 * @returns Stable comparison value.
 */
function compareDeclarations(left: DeclarationOccurrence, right: DeclarationOccurrence): number {
  return (
    left.logicalId.localeCompare(right.logicalId) ||
    left.location.filePath.localeCompare(right.location.filePath) ||
    left.location.line - right.location.line ||
    left.location.column - right.location.column ||
    left.symbolId.localeCompare(right.symbolId)
  )
}

/**
 * Orders hierarchy evidence by child, precedence, parent, and kind.
 * @param left - Left hierarchy fact.
 * @param right - Right hierarchy fact.
 * @returns Stable comparison value.
 */
function compareHierarchyFacts(left: HierarchyFact, right: HierarchyFact): number {
  return (
    left.childId.localeCompare(right.childId) ||
    left.precedence - right.precedence ||
    left.parentId.localeCompare(right.parentId) ||
    left.kind.localeCompare(right.kind)
  )
}

/**
 * Compares one-based source positions.
 * @param leftLine - Left line.
 * @param leftColumn - Left column.
 * @param rightLine - Right line.
 * @param rightColumn - Right column.
 * @returns Stable comparison value.
 */
function comparePosition(
  leftLine: number,
  leftColumn: number,
  rightLine: number,
  rightColumn: number,
): number {
  return leftLine - rightLine || leftColumn - rightColumn
}
