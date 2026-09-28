import { type SourceLocation } from './source-location.js'
import { type SymbolKind } from './symbol-kind.js'

/** Separates namespaces that may legally share a spelling in one language. */
export const SymbolSpace = {
  Value: 'value',
  Type: 'type',
  Namespace: 'namespace',
  Property: 'property',
} as const

/** A namespace in which a logical symbol or binding is resolved. */
export type SymbolSpace = (typeof SymbolSpace)[keyof typeof SymbolSpace]

/** Broad member classification, independent of dispatch and accessor role. */
export const MemberKind = {
  Method: 'method',
  Property: 'property',
  Field: 'field',
  Constructor: 'constructor',
  Signature: 'signature',
  Indexer: 'indexer',
  Operator: 'operator',
  Event: 'event',
  Other: 'other',
} as const

/** A language-neutral member kind. */
export type MemberKind = (typeof MemberKind)[keyof typeof MemberKind]

/** How a member is selected on its owner. */
export const MemberDispatch = {
  Instance: 'instance',
  Static: 'static',
} as const

/** Instance or static dispatch. */
export type MemberDispatch = (typeof MemberDispatch)[keyof typeof MemberDispatch]

/** Accessor role when a member is a getter or setter. */
export const MemberAccessor = {
  Get: 'get',
  Set: 'set',
} as const

/** Getter or setter role. */
export type MemberAccessor = (typeof MemberAccessor)[keyof typeof MemberAccessor]

/** Independent member axes. A non-member omits this object. */
export interface MemberSemantics {
  /** Broad member classification. */
  readonly kind: MemberKind
  /** Instance or static selection, when the grammar proves it. */
  readonly dispatch?: MemberDispatch
  /** Getter or setter role, when the grammar proves it. */
  readonly accessor?: MemberAccessor
  /** Proven language-native nuance. Absent when the grammar does not prove one. */
  readonly nativeKind?: string
}

/** One hop in a reconstructed owner path. */
export interface SymbolPathSegment {
  /** Simple name of this hop. */
  readonly name: string
  /** Whether the hop is a namespace, a type, or the member. */
  readonly role: 'namespace' | 'type' | 'member'
}

/** Adapter-parsed owner-then-member selector. */
export interface StructuredSymbolReference {
  /** Owner hops followed by the member. */
  readonly segments: readonly SymbolPathSegment[]
  /** Proven member axes, when the text includes them. */
  readonly memberSemantics?: MemberSemantics
  /** Lookup space, when the text proves one. */
  readonly space?: SymbolSpace
}

/** Zero or more explicit parse candidates. No guessed winner. */
export interface ParsedSymbolReference {
  /** Explicit structured candidates. */
  readonly candidates: readonly StructuredSymbolReference[]
}

/** A source declaration that realizes one logical symbol. */
export interface DeclarationOccurrence {
  /** Logical identity realized by this source occurrence. */
  readonly logicalId: string
  /** Stable location-backed identity retained for backwards compatibility. */
  readonly symbolId: string
  /** Source location of the declaration. */
  readonly location: SourceLocation
  /** Existing graph kind for the declaration. */
  readonly kind: SymbolKind
}

/** Semantic identity shared by all declarations of one logical target. */
export interface LogicalSymbol {
  /** Deterministic, structured and delimiter-safe logical identity. */
  readonly id: string
  /** Workspace owning the target. */
  readonly workspace: string
  /** Canonical module or package surface containing the target. */
  readonly surface: string
  /** Declared name, preserving language-specific case. */
  readonly name: string
  /** Namespace in which the name is meaningful. */
  readonly space: SymbolSpace
  /** Optional enclosing logical target for members. */
  readonly ownerId: string | undefined
  /** Optional member axes. Absent for non-members. */
  readonly memberSemantics: MemberSemantics | undefined
  /**
   * Generic dotted owner path, such as `GetStatus.execute`.
   * Absent when the symbol has no owner. Not part of the canonical id.
   */
  readonly qualifiedName?: string
}

/** A named route from a public module surface to a logical target. */
export interface PublicBinding {
  /** Deterministic identity for this public route. */
  readonly id: string
  /** Public surface from which the target is exported. */
  readonly surface: string
  /** Exported spelling, including a language's default-export marker when applicable. */
  readonly exportedName: string
  /** Namespace of the export. */
  readonly space: SymbolSpace
  /** Logical target reached by the route when proven. */
  readonly targetId: string | undefined
}

/** A lexical name introduced by an import, alias, or declaration. */
export interface LocalBinding {
  /** Deterministic identity for the lexical binding. */
  readonly id: string
  /** File containing the lexical scope. */
  readonly filePath: string
  /** Adapter-provided lexical scope identity. */
  readonly scopeId: string
  /** Spelling visible within the scope. */
  readonly localName: string
  /** Namespace of the binding. */
  readonly space: SymbolSpace
  /** Logical target reached by the binding when proven. */
  readonly targetId: string | undefined
}

/** One evidence-preserving hop through aliases, exports, or hierarchy. */
export interface ResolutionStep {
  /** Source identity for the step. */
  readonly fromId: string
  /** Destination identity for the step. */
  readonly toId: string
  /** Stable relation/provenance category supplied by the adapter or graph. */
  readonly kind: string
}

/** Explicit semantic capabilities an adapter can prove for a language and build context. */
export interface AdapterCapabilities {
  readonly declarations: boolean
  readonly members: boolean
  readonly publicBindings: boolean
  readonly localBindings: boolean
  readonly hierarchy: boolean
  readonly buildContext: boolean
}

/** A proven, directed hierarchy relationship used for member lookup. */
export interface HierarchyFact {
  readonly childId: string
  readonly parentId: string
  readonly kind: string
  readonly precedence: number
}

/** Additive semantic facts emitted by an adapter alongside legacy graph nodes. */
export interface ReferenceFacts {
  readonly declarations: readonly DeclarationOccurrence[]
  readonly publicBindings: readonly PublicBinding[]
  readonly localBindings: readonly LocalBinding[]
  readonly hierarchy: readonly HierarchyFact[]
  readonly steps: readonly ResolutionStep[]
  readonly capabilities: AdapterCapabilities
}

/** Structured input for conservative symbol-reference resolution. */
export interface ResolveSymbolReferenceInput {
  readonly workspace: string
  readonly requested: string
  readonly language?: string
  readonly filePath?: string
  readonly publicSurface?: string
  readonly symbolSpace?: SymbolSpace
  readonly kind?: SymbolKind
  readonly logicalId?: string
  readonly ownerId?: string
  readonly memberSemantics?: MemberSemantics
  readonly scopeId?: string
  readonly buildContext?: Readonly<Record<string, string>>
}

/** The four conservative outcomes exposed by reference resolution. */
export type ResolutionStatus = 'resolved' | 'ambiguous' | 'unresolved' | 'missing'

/** Freshness snapshot shared by one resolution batch. */
export interface ResolutionHealth {
  readonly fresh: boolean | null
  readonly complete: boolean | null
  readonly reasonCodes: readonly string[]
}

/** One deterministically ordered logical candidate and its evidence. */
export interface ResolutionCandidate {
  readonly target: LogicalSymbol
  readonly declarations: readonly DeclarationOccurrence[]
  readonly path: readonly ResolutionStep[]
}

/** Conservative resolution result for one structured request. */
export interface SymbolResolutionResult {
  readonly request: ResolveSymbolReferenceInput
  readonly status: ResolutionStatus
  readonly reasonCode: string | null
  readonly health: ResolutionHealth
  readonly target: LogicalSymbol | null
  readonly candidates: readonly ResolutionCandidate[]
  readonly path: readonly ResolutionStep[]
}

/**
 * Creates a first-class public binding identity.
 * @param params - Public binding fields excluding the derived identifier.
 * @returns Public binding with a deterministic identifier.
 */
export function createPublicBinding(params: Omit<PublicBinding, 'id'>): PublicBinding {
  return {
    ...params,
    id: [
      'public',
      encodePart(params.surface),
      encodePart(params.exportedName),
      encodePart(params.space),
      encodePart(params.targetId ?? ''),
    ].join('|'),
  }
}

/**
 * Creates a first-class lexical binding identity.
 * @param params - Local binding fields excluding the derived identifier.
 * @returns Local binding with a deterministic identifier.
 */
export function createLocalBinding(params: Omit<LocalBinding, 'id'>): LocalBinding {
  return {
    ...params,
    id: [
      'local',
      encodePart(params.filePath),
      encodePart(params.scopeId),
      encodePart(params.localName),
      encodePart(params.space),
    ].join('|'),
  }
}

/**
 * Encodes structured fields without relying on language syntax delimiters.
 * @param value - Field value to encode.
 * @returns Length-prefixed field value.
 */
function encodePart(value: string): string {
  return `${value.length}:${value}`
}

/**
 * Creates a deterministic logical-symbol identity from semantic fields.
 * @param params - Logical symbol fields excluding the derived identifier.
 * @returns Logical symbol with a deterministic identifier.
 */
export function createLogicalSymbol(params: Omit<LogicalSymbol, 'id'>): LogicalSymbol {
  const id = [
    'logical',
    '2',
    encodePart(params.workspace),
    encodePart(params.surface),
    encodePart(params.name),
    encodePart(params.space),
    encodePart(params.ownerId ?? ''),
    encodePart(params.memberSemantics?.kind ?? ''),
    encodePart(params.memberSemantics?.dispatch ?? ''),
    encodePart(params.memberSemantics?.accessor ?? ''),
    encodePart(params.memberSemantics?.nativeKind ?? ''),
  ].join('|')

  return { ...params, id }
}

/**
 * Rebuilds the generic dotted spelling from an owner chain.
 * @param symbol - Member whose path is requested.
 * @param byId - Logical symbols addressable by id, including `symbol`.
 * @returns `Owner.member`, or undefined when the symbol has no owner or the chain is incomplete.
 */
export function deriveQualifiedName(
  symbol: LogicalSymbol,
  byId: ReadonlyMap<string, LogicalSymbol>,
): string | undefined {
  if (symbol.ownerId === undefined) return undefined
  const names = [symbol.name]
  const seen = new Set<string>([symbol.id])
  let ownerId: string | undefined = symbol.ownerId
  while (ownerId !== undefined) {
    if (seen.has(ownerId)) return undefined
    seen.add(ownerId)
    const owner = byId.get(ownerId)
    if (owner === undefined) return undefined
    names.unshift(owner.name)
    ownerId = owner.ownerId
  }
  return names.join('.')
}

/**
 * Copies logical symbols with `qualifiedName` set from the owner chain.
 * Symbols without an owner keep no qualified name. Canonical ids do not change.
 * @param symbols - Logical symbols that may reference each other by `ownerId`.
 * @returns The same identities with stored qualified spellings.
 */
export function assignQualifiedNames(symbols: readonly LogicalSymbol[]): LogicalSymbol[] {
  const byId = new Map(symbols.map((symbol) => [symbol.id, symbol]))
  return symbols.map((symbol) => {
    const qualifiedName = deriveQualifiedName(symbol, byId)
    if (qualifiedName === undefined) return symbol
    return { ...symbol, qualifiedName }
  })
}

/**
 * Parses the delimiter-safe canonical identity emitted by {@link createLogicalSymbol}.
 * @param id - Canonical logical-symbol identifier.
 * @returns Parsed logical symbol, or undefined for an invalid identifier.
 */
export function parseLogicalSymbol(id: string): LogicalSymbol | undefined {
  if (!id.startsWith('logical|2|')) return undefined
  let cursor = 'logical|2|'.length
  const decoded: string[] = []
  for (let index = 0; index < 9; index += 1) {
    const separator = id.indexOf(':', cursor)
    if (separator < cursor) return undefined
    const length = Number(id.slice(cursor, separator))
    const valueStart = separator + 1
    const valueEnd = valueStart + length
    if (!Number.isSafeInteger(length) || length < 0 || valueEnd > id.length) return undefined
    decoded.push(id.slice(valueStart, valueEnd))
    cursor = valueEnd
    if (index < 8) {
      if (id[cursor] !== '|') return undefined
      cursor += 1
    }
  }
  if (cursor !== id.length) return undefined

  const workspace = decoded[0]!
  const surface = decoded[1]!
  const name = decoded[2]!
  const space = decoded[3]!
  const ownerId = decoded[4]!
  const memberKind = decoded[5]!
  const memberDispatch = decoded[6]!
  const memberAccessor = decoded[7]!
  const nativeKind = decoded[8]!
  if (!isSymbolSpace(space)) return undefined
  if (memberKind !== '' && !isMemberKind(memberKind)) return undefined
  if (memberDispatch !== '' && !isMemberDispatch(memberDispatch)) return undefined
  if (memberAccessor !== '' && !isMemberAccessor(memberAccessor)) return undefined
  const memberSemantics =
    memberKind === ''
      ? undefined
      : {
          kind: memberKind,
          ...(memberDispatch === '' ? {} : { dispatch: memberDispatch }),
          ...(memberAccessor === '' ? {} : { accessor: memberAccessor }),
          ...(nativeKind === '' ? {} : { nativeKind }),
        }

  return {
    id,
    workspace,
    surface,
    name,
    space,
    ownerId: ownerId || undefined,
    memberSemantics,
  }
}

/**
 * Checks whether a string is a recognized symbol space.
 * @param value - Candidate symbol-space value.
 * @returns Whether the value is a symbol space.
 */
function isSymbolSpace(value: string): value is SymbolSpace {
  return Object.values(SymbolSpace).includes(value as SymbolSpace)
}

/**
 * Checks whether a string is a recognized member form.
 * @param value - Candidate member-form value.
 * @returns Whether the value is a member form.
 */
function isMemberKind(value: string): value is MemberKind {
  return Object.values(MemberKind).includes(value as MemberKind)
}

/**
 * Checks whether a string is a recognized member dispatch.
 * @param value - Candidate dispatch value.
 * @returns Whether the value is a member dispatch.
 */
function isMemberDispatch(value: string): value is MemberDispatch {
  return Object.values(MemberDispatch).includes(value as MemberDispatch)
}

/**
 * Checks whether a string is a recognized member accessor.
 * @param value - Candidate accessor value.
 * @returns Whether the value is a member accessor.
 */
function isMemberAccessor(value: string): value is MemberAccessor {
  return Object.values(MemberAccessor).includes(value as MemberAccessor)
}
