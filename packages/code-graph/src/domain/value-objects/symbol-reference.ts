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

/** Describes how a member participates in its owner’s API. */
export const MemberForm = {
  Instance: 'instance',
  Static: 'static',
  Constructor: 'constructor',
  Getter: 'getter',
  Setter: 'setter',
  Signature: 'signature',
} as const

/** A language-neutral member form. */
export type MemberForm = (typeof MemberForm)[keyof typeof MemberForm]

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
  /** Optional member dispatch form. */
  readonly memberForm: MemberForm | undefined
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
  readonly filePath?: string
  readonly publicSurface?: string
  readonly symbolSpace?: SymbolSpace
  readonly kind?: SymbolKind
  readonly logicalId?: string
  readonly ownerId?: string
  readonly memberForm?: MemberForm
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
    encodePart(params.workspace),
    encodePart(params.surface),
    encodePart(params.name),
    encodePart(params.space),
    encodePart(params.ownerId ?? ''),
    encodePart(params.memberForm ?? ''),
  ].join('|')

  return { ...params, id }
}

/**
 * Parses the delimiter-safe canonical identity emitted by {@link createLogicalSymbol}.
 * @param id - Canonical logical-symbol identifier.
 * @returns Parsed logical symbol, or undefined for an invalid identifier.
 */
export function parseLogicalSymbol(id: string): LogicalSymbol | undefined {
  if (!id.startsWith('logical|')) return undefined
  let cursor = 'logical|'.length
  const decoded: string[] = []
  for (let index = 0; index < 6; index += 1) {
    const separator = id.indexOf(':', cursor)
    if (separator < cursor) return undefined
    const length = Number(id.slice(cursor, separator))
    const valueStart = separator + 1
    const valueEnd = valueStart + length
    if (!Number.isSafeInteger(length) || length < 0 || valueEnd > id.length) return undefined
    decoded.push(id.slice(valueStart, valueEnd))
    cursor = valueEnd
    if (index < 5) {
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
  const memberForm = decoded[5]!
  if (!isSymbolSpace(space) || (memberForm !== '' && !isMemberForm(memberForm))) return undefined

  return {
    id,
    workspace,
    surface,
    name,
    space,
    ownerId: ownerId || undefined,
    memberForm: memberForm || undefined,
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
function isMemberForm(value: string): value is MemberForm {
  return Object.values(MemberForm).includes(value as MemberForm)
}
