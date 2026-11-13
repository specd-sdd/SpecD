import {
  createSymbolNode,
  type SourceRange,
  type SymbolNode,
} from '../../domain/value-objects/symbol-node.js'
import { SymbolKind } from '../../domain/value-objects/symbol-kind.js'
import {
  assignQualifiedNames,
  createLogicalSymbol,
  type DeclarationOccurrence,
  type DeclarationOccurrenceForm,
  type HierarchyFact,
  type LogicalDeclarationDiagnostic,
  type LogicalSymbol,
  type MemberSemantics,
  type ResolutionStep,
  type SourcePosition,
  type SymbolSpace,
} from '../../domain/value-objects/symbol-reference.js'

/** Role-aware declaration decision emitted by a language adapter before graph registration. */
export type AdapterDeclarationDecision =
  | {
      readonly role: 'logical'
      readonly surface: string
      readonly space: SymbolSpace
      readonly ownerSymbolId?: string
      readonly requiresOwner: boolean
      readonly memberSemantics?: MemberSemantics
      readonly occurrenceForm: DeclarationOccurrenceForm
      readonly groupKey?: string
    }
  | {
      readonly role: 'lexical-binding'
      readonly scopeId: string
      readonly space: SymbolSpace
      readonly reason: string
    }
  | {
      readonly role: 'physical-only'
      readonly reason: string
    }
  | {
      readonly role: 'unsupported'
      readonly reason: string
    }

/** Filtered declaration decision admitted into physical and/or logical symbol indexing. */
export type GraphDeclarationDecision = Exclude<
  AdapterDeclarationDecision,
  { readonly role: 'unsupported' }
>

/** Describes one syntax-proven declaration before logical identity is constructed. */
export type AdapterDeclarationDescriptor =
  | (GraphDeclarationDecision & { readonly symbol: SymbolNode })
  | {
      readonly role?: 'logical'
      readonly symbol: SymbolNode
      readonly surface: string
      readonly space: SymbolSpace
      readonly ownerSymbolId?: string
      readonly requiresOwner?: boolean
      readonly memberSemantics?: MemberSemantics
      readonly occurrenceForm?: DeclarationOccurrenceForm
      readonly groupKey?: string
    }

/** Candidate AST syntax considered for symbol declaration extraction. */
export interface AdapterSyntaxCandidate {
  readonly syntaxRole: string
  readonly nodeKind: string
  readonly name: string | undefined
  readonly range: SourceRange
  readonly selectionRange: SourceRange | undefined
}

/** Policy governing semantic caller containment candidate selection. */
export interface CallableContainmentPolicy {
  readonly callableKinds: ReadonlySet<SymbolKind>
  readonly eligibleSymbolIds?: ReadonlySet<string>
}

/** Work categories observable by deterministic complexity tests. */
export type StructuralWorkKind =
  | 'declaration-symbol-indexed'
  | 'declaration-symbol-lookup'
  | 'callable-symbol-indexed'
  | 'callable-interval-visited'
  | 'owner-member-node-visited'
  | 'lexical-scope-node-visited'
  | 'interface-method-set-expanded'

/** Optional package-internal observer used only to count structural work. */
export interface StructuralWorkObserver {
  record(kind: StructuralWorkKind): void
}

const ADAPTER_TEST_OBSERVERS = new WeakMap<object, StructuralWorkObserver>()

/**
 * Sets a package-internal structural-work observer on an adapter instance for focused testing.
 * @param adapter - The adapter instance.
 * @param observer - The observer to attach, or undefined to detach.
 */
export function setStructuralWorkObserverForTesting(
  adapter: object,
  observer: StructuralWorkObserver | undefined,
): void {
  if (observer) {
    ADAPTER_TEST_OBSERVERS.set(adapter, observer)
  } else {
    ADAPTER_TEST_OBSERVERS.delete(adapter)
  }
}

/**
 * Retrieves the structural-work observer attached to an adapter instance, if any.
 * @param adapter - The adapter instance.
 * @returns The attached observer or undefined.
 */
export function getStructuralWorkObserver(adapter: object): StructuralWorkObserver | undefined {
  return ADAPTER_TEST_OBSERVERS.get(adapter)
}

/** Exact declaration lookup over extracted symbols. */
export interface DeclarationSymbolIndex {
  readonly size: number
  find(kind: SymbolKind, name: string, line: number, column: number): SymbolNode | undefined
}

/**
 * Creates one exact declaration index; duplicate exact keys resolve by stable symbol id.
 * @param symbols - Extracted declaration symbols in the file.
 * @param observer - Optional test observer recording build and lookup operations.
 * @returns Immutable declaration index for constant-time exact symbol lookup.
 */
export function createDeclarationSymbolIndex(
  symbols: readonly SymbolNode[],
  observer?: StructuralWorkObserver,
): DeclarationSymbolIndex {
  const map = new Map<string, SymbolNode[]>()

  for (const sym of symbols) {
    observer?.record('declaration-symbol-indexed')
    const key = `${sym.kind}\u0000${sym.line}\u0000${sym.column}\u0000${sym.name}`
    const existing = map.get(key)
    if (existing === undefined) {
      map.set(key, [sym])
    } else {
      existing.push(sym)
    }
  }

  for (const entries of map.values()) {
    if (entries.length > 1) {
      entries.sort((a, b) => a.id.localeCompare(b.id))
    }
  }

  return {
    get size(): number {
      return map.size
    },
    find(kind: SymbolKind, name: string, line: number, column: number): SymbolNode | undefined {
      observer?.record('declaration-symbol-lookup')
      const key = `${kind}\u0000${line}\u0000${column}\u0000${name}`
      const entries = map.get(key)
      return entries?.[0]
    },
  }
}

/** Reusable half-open interval lookup for innermost callable ownership. */
export interface CallableContainmentIndex {
  readonly size: number
  find(position: SourcePosition): SymbolNode | undefined
}

/** Bounded interval representation for a callable declaration. */
interface CallableInterval {
  readonly symbol: SymbolNode
  readonly start: SourcePosition
  readonly end: SourcePosition
}

/** Node in the balanced callable interval tree. */
interface CallableIntervalNode {
  readonly interval: CallableInterval
  readonly minStart: SourcePosition
  readonly maxEnd: SourcePosition
  readonly left?: CallableIntervalNode
  readonly right?: CallableIntervalNode
}

/**
 * Compares two source positions lexicographically.
 * @param a - First position.
 * @param b - Second position.
 * @returns Negative if a < b, positive if a > b, 0 if equal.
 */
function comparePositions(a: SourcePosition, b: SourcePosition): number {
  if (a.line !== b.line) return a.line - b.line
  return a.column - b.column
}

/**
 * Checks whether position a is before or equal to position b.
 * @param a - First position.
 * @param b - Second position.
 * @returns True when a <= b.
 */
function isBeforeOrEqual(a: SourcePosition, b: SourcePosition): boolean {
  return a.line < b.line || (a.line === b.line && a.column <= b.column)
}

/**
 * Checks whether position a is strictly before position b.
 * @param a - First position.
 * @param b - Second position.
 * @returns True when a < b.
 */
function isBefore(a: SourcePosition, b: SourcePosition): boolean {
  return a.line < b.line || (a.line === b.line && a.column < b.column)
}

/**
 * Determines whether candidate is a better (innermost) match than best.
 * @param candidate - Candidate interval to evaluate.
 * @param best - Current best interval.
 * @returns True when candidate is innermost according to policy rules.
 */
function isBetterCandidate(candidate: CallableInterval, best: CallableInterval): boolean {
  const startCmp = comparePositions(candidate.start, best.start)
  if (startCmp > 0) return true
  if (startCmp < 0) return false
  const endCmp = comparePositions(candidate.end, best.end)
  if (endCmp < 0) return true
  if (endCmp > 0) return false
  return candidate.symbol.id.localeCompare(best.symbol.id) < 0
}

/**
 * Recursively builds a balanced interval tree from sorted callable intervals.
 * @param items - Sorted interval list.
 * @param startIdx - Subtree start index.
 * @param endIdx - Subtree end index.
 * @returns Root node of the balanced interval tree or undefined when empty.
 */
function buildIntervalTree(
  items: readonly CallableInterval[],
  startIdx: number,
  endIdx: number,
): CallableIntervalNode | undefined {
  if (startIdx > endIdx) return undefined
  const mid = Math.floor((startIdx + endIdx) / 2)
  const current = items[mid]!
  const left = buildIntervalTree(items, startIdx, mid - 1)
  const right = buildIntervalTree(items, mid + 1, endIdx)

  let minStart = current.start
  let maxEnd = current.end

  if (left !== undefined) {
    if (comparePositions(left.minStart, minStart) < 0) {
      minStart = left.minStart
    }
    if (comparePositions(left.maxEnd, maxEnd) > 0) {
      maxEnd = left.maxEnd
    }
  }

  if (right !== undefined) {
    if (comparePositions(right.minStart, minStart) < 0) {
      minStart = right.minStart
    }
    if (comparePositions(right.maxEnd, maxEnd) > 0) {
      maxEnd = right.maxEnd
    }
  }

  return {
    interval: current,
    minStart,
    maxEnd,
    ...(left !== undefined ? { left } : {}),
    ...(right !== undefined ? { right } : {}),
  }
}

/**
 * Builds one callable interval tree for one immutable symbol collection and policy.
 * @param symbols - Extracted declaration symbols in the file.
 * @param policy - Callable kinds and eligibility constraints.
 * @param observer - Optional test observer recording build and lookup operations.
 * @returns Balanced interval tree for innermost callable lookup.
 */
export function createCallableContainmentIndex(
  symbols: readonly SymbolNode[],
  policy: CallableContainmentPolicy,
  observer?: StructuralWorkObserver,
): CallableContainmentIndex {
  const intervals: CallableInterval[] = []

  for (const symbol of symbols) {
    if (!policy.callableKinds.has(symbol.kind)) continue
    if (policy.eligibleSymbolIds !== undefined && !policy.eligibleSymbolIds.has(symbol.id)) {
      continue
    }
    if (symbol.endLine === undefined || symbol.endColumn === undefined) continue

    observer?.record('callable-symbol-indexed')
    intervals.push({
      symbol,
      start: { line: symbol.line, column: symbol.column },
      end: { line: symbol.endLine, column: symbol.endColumn },
    })
  }

  intervals.sort((a, b) => {
    const startCmp = comparePositions(a.start, b.start)
    if (startCmp !== 0) return startCmp
    const endCmp = comparePositions(b.end, a.end)
    if (endCmp !== 0) return endCmp
    return a.symbol.id.localeCompare(b.symbol.id)
  })

  const rootNode = buildIntervalTree(intervals, 0, intervals.length - 1)

  return {
    get size(): number {
      return intervals.length
    },
    find(position: SourcePosition): SymbolNode | undefined {
      if (rootNode === undefined) return undefined

      let best: CallableInterval | undefined = undefined

      const search = (node: CallableIntervalNode | undefined): void => {
        if (node === undefined) return

        if (isBefore(position, node.minStart) || isBeforeOrEqual(node.maxEnd, position)) {
          return
        }

        observer?.record('callable-interval-visited')

        if (
          isBeforeOrEqual(node.interval.start, position) &&
          isBefore(position, node.interval.end)
        ) {
          if (best === undefined || isBetterCandidate(node.interval, best)) {
            best = node.interval
          }
        }

        search(node.left)
        search(node.right)
      }

      search(rootNode)
      return (best as CallableInterval | undefined)?.symbol
    },
  }
}

/**
 * Creates a declaration descriptor while omitting unproven optional evidence.
 * @param input - Syntax-proven declaration dimensions.
 * @param input.symbol - Extracted declaration symbol.
 * @param input.surface - Semantic module or package surface.
 * @param input.space - Proven symbol space.
 * @param input.ownerSymbolId - Extracted owner identity, when proven.
 * @param input.requiresOwner - Whether logical projection requires an owner.
 * @param input.memberSemantics - Proven member axes, when applicable.
 * @param input.occurrenceForm - Signature versus definition form.
 * @param input.groupKey - Language-proven overload group discriminator.
 * @returns Exact-optional-property-safe declaration descriptor.
 */
export function createAdapterDeclarationDescriptor(input: {
  readonly symbol: SymbolNode
  readonly surface: string
  readonly space: SymbolSpace
  readonly ownerSymbolId: string | undefined
  readonly requiresOwner: boolean
  readonly memberSemantics: MemberSemantics | undefined
  readonly occurrenceForm?: DeclarationOccurrenceForm
  readonly groupKey?: string
}): AdapterDeclarationDescriptor {
  return {
    role: 'logical',
    symbol: input.symbol,
    surface: input.surface,
    space: input.space,
    requiresOwner: input.requiresOwner,
    occurrenceForm: input.occurrenceForm ?? 'definition',
    ...(input.groupKey === undefined ? {} : { groupKey: input.groupKey }),
    ...(input.ownerSymbolId === undefined ? {} : { ownerSymbolId: input.ownerSymbolId }),
    ...(input.memberSemantics === undefined ? {} : { memberSemantics: input.memberSemantics }),
  }
}

/**
 * Creates a physical-only declaration descriptor without logical projection.
 * @param input - Physical declaration input.
 * @param input.symbol - Physical symbol node.
 * @param input.reason - Reason logical projection is unavailable.
 * @returns Physical-only declaration descriptor.
 */
export function createPhysicalOnlyDeclarationDescriptor(input: {
  readonly symbol: SymbolNode
  readonly reason: string
}): AdapterDeclarationDescriptor {
  return {
    role: 'physical-only',
    symbol: input.symbol,
    reason: input.reason,
  }
}

/**
 * Creates a lexical-binding declaration descriptor without logical projection.
 * @param input - Lexical binding input.
 * @param input.symbol - Binding symbol node.
 * @param input.scopeId - Owning lexical scope identifier.
 * @param input.space - Symbol namespace occupied by the binding.
 * @param input.reason - Reason this is not a logical declaration.
 * @returns Lexical-binding declaration descriptor.
 */
export function createLexicalBindingDeclarationDescriptor(input: {
  readonly symbol: SymbolNode
  readonly scopeId: string
  readonly space: SymbolSpace
  readonly reason: string
}): AdapterDeclarationDescriptor {
  return {
    role: 'lexical-binding',
    symbol: input.symbol,
    scopeId: input.scopeId,
    space: input.space,
    reason: input.reason,
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
  /** Owners of surviving members whose own declarations were demoted by a collision. */
  readonly retainedLogicalSymbols: readonly LogicalSymbol[]
  readonly diagnostics: readonly LogicalDeclarationDiagnostic[]
}

export type { LogicalDeclarationDiagnostic }

/** Hierarchy projection shared by built-in language adapters. */
export interface HierarchyReferenceFacts {
  readonly hierarchy: readonly HierarchyFact[]
  readonly steps: readonly ResolutionStep[]
}

/**
 * Builds relation metadata shared verbatim with imported hierarchy facts.
 * @param input - Proven imported hierarchy evidence.
 * @param input.clauseRange - Parser range of the written base or heritage expression.
 * @param input.precedence - Ordered hierarchy precedence.
 * @param input.requestedName - Imported spelling used by the hierarchy clause.
 * @param input.resolvedTargetSymbolId - Proven physical target declaration.
 * @returns Immutable relation metadata for session fact projection.
 */
export function createImportedHierarchyMetadata(input: {
  readonly clauseRange: SourceRange
  readonly precedence: number
  readonly requestedName: string
  readonly resolvedTargetSymbolId: string
}): Readonly<Record<string, unknown>> {
  return {
    precedence: input.precedence,
    sourceRange: {
      startLine: input.clauseRange.startLine,
      startColumn: input.clauseRange.startColumn,
      endLine: input.clauseRange.endLine,
      endColumn: input.clauseRange.endColumn,
    },
    importProvenance: {
      kind: 'import',
      requestedName: input.requestedName,
      resolvedTargetSymbolId: input.resolvedTargetSymbolId,
    },
  }
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
 * Finds the innermost language-approved executable declaration containing a call position.
 * Uses half-open line and column coordinates: start <= position < end.
 * @param symbols - Extracted declaration symbols in the file.
 * @param position - Call fact source position (1-based line, 0-based column).
 * @param policy - Callable kinds and eligibility constraints.
 * @returns Innermost containing callable symbol, or undefined when unresolved.
 */
export function findContainingCallableSymbol(
  symbols: readonly SymbolNode[],
  position: SourcePosition,
  policy: CallableContainmentPolicy,
): SymbolNode | undefined {
  return createCallableContainmentIndex(symbols, policy).find(position)
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
  const logicalDescriptors = input.declarations.filter(
    (
      item,
    ): item is AdapterDeclarationDescriptor & {
      readonly surface: string
      readonly space: SymbolSpace
      readonly ownerSymbolId?: string
      readonly requiresOwner?: boolean
      readonly memberSemantics?: MemberSemantics
      readonly occurrenceForm?: DeclarationOccurrenceForm
      readonly groupKey?: string
    } =>
      (item.role === undefined || item.role === 'logical') && 'surface' in item && 'space' in item,
  )

  const descriptors = new Map(logicalDescriptors.map((item) => [item.symbol.id, item]))
  const logicalBySymbolId = new Map<string, LogicalSymbol>()
  const visiting = new Set<string>()

  const groupKeyByLogicalId = new Map<string, string>()
  const symbolIdsByLogicalId = new Map<string, string[]>()
  const conflictLogicalIds = new Set<string>()
  const ungroupedCollisionIds = new Set<string>()

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
      memberSemantics: descriptor.memberSemantics,
    })

    const groupKey = descriptor.groupKey?.trim()
    const symbolIds = symbolIdsByLogicalId.get(logical.id) ?? []
    if (symbolIds.length > 0) {
      const existingKey = groupKeyByLogicalId.get(logical.id)
      if (existingKey === undefined || groupKey === undefined || groupKey.length === 0) {
        conflictLogicalIds.add(logical.id)
        ungroupedCollisionIds.add(logical.id)
      } else if (existingKey !== groupKey) {
        conflictLogicalIds.add(logical.id)
      }
    } else if (groupKey !== undefined && groupKey.length > 0) {
      groupKeyByLogicalId.set(logical.id, groupKey)
    }
    symbolIds.push(symbolId)
    symbolIdsByLogicalId.set(logical.id, symbolIds)

    logicalBySymbolId.set(symbolId, logical)
    return logical
  }

  for (const descriptor of logicalDescriptors) {
    materialize(descriptor.symbol.id)
  }

  const demotedById = new Map<string, LogicalSymbol>()
  for (const conflictId of conflictLogicalIds) {
    for (const [symbolId, logical] of logicalBySymbolId) {
      if (logical.id === conflictId) {
        demotedById.set(logical.id, logical)
        logicalBySymbolId.delete(symbolId)
      }
    }
  }
  // Members of a demoted owner keep a resolvable ownerId: retain the owner identity
  // (without any declaration) for every surviving member's owner chain.
  const survivingIds = new Set([...logicalBySymbolId.values()].map((logical) => logical.id))
  const retainedById = new Map<string, LogicalSymbol>()
  for (const logical of logicalBySymbolId.values()) {
    let ownerId = logical.ownerId
    while (ownerId !== undefined && !survivingIds.has(ownerId)) {
      const demoted = demotedById.get(ownerId)
      if (demoted === undefined || retainedById.has(ownerId)) break
      retainedById.set(ownerId, demoted)
      ownerId = demoted.ownerId
    }
  }

  const uniqueLogicalMap = new Map<string, LogicalSymbol>()
  for (const logical of logicalBySymbolId.values()) {
    uniqueLogicalMap.set(logical.id, logical)
  }
  const named = new Map(
    assignQualifiedNames([...uniqueLogicalMap.values(), ...retainedById.values()]).map((symbol) => [
      symbol.id,
      symbol,
    ]),
  )
  for (const [symbolId, logical] of logicalBySymbolId) {
    const updated = named.get(logical.id)
    if (updated !== undefined) logicalBySymbolId.set(symbolId, updated)
  }

  const declarations = logicalDescriptors
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
          form: descriptor.occurrenceForm ?? 'definition',
          occurrenceForm: descriptor.occurrenceForm ?? 'definition',
        },
      ]
    })
    .sort(compareDeclarations)

  const diagnostics: LogicalDeclarationDiagnostic[] = [...conflictLogicalIds]
    .sort()
    .map((logicalId) => ({
      code: ungroupedCollisionIds.has(logicalId)
        ? 'UNGROUPED_LOGICAL_COLLISION'
        : 'CONFLICTING_DECLARATION_GROUP',
      logicalId,
      symbolIds: [...(symbolIdsByLogicalId.get(logicalId) ?? [])].sort(),
    }))

  return {
    declarations,
    logicalBySymbolId,
    retainedLogicalSymbols: [...retainedById.values()]
      .map((logical) => named.get(logical.id) ?? logical)
      .sort((left, right) => left.id.localeCompare(right.id)),
    diagnostics,
  }
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
    (left.logicalId ?? '').localeCompare(right.logicalId ?? '') ||
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

/**
 * Copies symbols, setting `parentId` from a proven owner map.
 * @param symbols - Extracted declarations.
 * @param ownerByMemberId - Member symbol id to owner symbol id.
 * @returns Symbols with declaration parents applied.
 */
export function withOwnerParents(
  symbols: readonly SymbolNode[],
  ownerByMemberId: ReadonlyMap<string, string>,
): SymbolNode[] {
  return symbols.map((symbol) => {
    const parentId = ownerByMemberId.get(symbol.id)
    if (parentId === undefined || symbol.parentId === parentId) return symbol
    return createSymbolNode({
      name: symbol.name,
      kind: symbol.kind,
      filePath: symbol.filePath,
      line: symbol.line,
      column: symbol.column,
      endLine: symbol.endLine,
      endColumn: symbol.endColumn,
      selectionRange: symbol.selectionRange,
      parentId,
      comment: symbol.comment,
    })
  })
}

/**
 * Lexical scope frame tracked on the active scope stack during parent resolution.
 */
export interface LexicalScopeFrame {
  readonly id: string
  readonly kind: SymbolKind
  readonly startLine: number
  readonly startColumn: number
  readonly endLine: number
  readonly endColumn: number
}

const CONTAINER_KINDS = new Set<string>([
  SymbolKind.Class,
  SymbolKind.Interface,
  SymbolKind.Type,
  SymbolKind.Enum,
])

const ROUTINE_KINDS = new Set<string>([SymbolKind.Function, SymbolKind.Method])

/**
 * Assigns enclosing container or routine symbols as parents using a coordinate-popped scope stack.
 * Container constructs (Class, Interface, Type, Enum) enclose methods and properties.
 * Routine constructs (Function, Method) enclose local variables and nested functions.
 * @param symbols - Extracted declarations.
 * @returns Symbols with enclosing parents applied.
 */
export function withEnclosingTypeParents(symbols: readonly SymbolNode[]): SymbolNode[] {
  const sorted = [...symbols].sort(
    (left, right) => left.line - right.line || left.column - right.column,
  )
  const parentById = new Map<string, string>()
  const scopeStack: LexicalScopeFrame[] = []

  for (const symbol of sorted) {
    while (scopeStack.length > 0) {
      const top = scopeStack[scopeStack.length - 1]!
      if (
        top.endLine < symbol.line ||
        (top.endLine === symbol.line && top.endColumn <= symbol.column)
      ) {
        scopeStack.pop()
      } else {
        break
      }
    }

    if (symbol.kind === SymbolKind.Method || symbol.kind === SymbolKind.Property) {
      for (let i = scopeStack.length - 1; i >= 0; i--) {
        const frame = scopeStack[i]!
        if (CONTAINER_KINDS.has(frame.kind)) {
          parentById.set(symbol.id, frame.id)
          break
        }
      }
    } else if (symbol.kind === SymbolKind.Variable || symbol.kind === SymbolKind.Function) {
      for (let i = scopeStack.length - 1; i >= 0; i--) {
        const frame = scopeStack[i]!
        if (ROUTINE_KINDS.has(frame.kind)) {
          parentById.set(symbol.id, frame.id)
          break
        }
      }
    }

    if (CONTAINER_KINDS.has(symbol.kind) || ROUTINE_KINDS.has(symbol.kind)) {
      scopeStack.push({
        id: symbol.id,
        kind: symbol.kind,
        startLine: symbol.line,
        startColumn: symbol.column,
        endLine: symbol.endLine,
        endColumn: symbol.endColumn,
      })
    }
  }

  return withOwnerParents(symbols, parentById)
}

/**
 * Range recorded for an import-derived local binding when the adapter did not capture the
 * import syntax position. It is deterministic, so identities stay stable across runs.
 */
export const WHOLE_FILE_START: SourceRange = {
  startLine: 1,
  startColumn: 0,
  endLine: 1,
  endColumn: 0,
}
