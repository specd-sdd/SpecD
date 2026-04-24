import { RelationType } from './relation-type.js'
import { type SourceLocation } from './source-location.js'

/**
 * Closed vocabulary for normalized call syntax emitted by adapters.
 */
export const CallForm = {
  Free: 'free',
  Member: 'member',
  Static: 'static',
  Constructor: 'constructor',
} as const

/**
 * Union type of valid normalized call forms.
 */
export type CallForm = (typeof CallForm)[keyof typeof CallForm]

/**
 * Normalized source-language invocation or construction fact.
 */
export interface CallFact {
  /** Workspace-prefixed file path containing the call syntax. */
  readonly filePath: string
  /** Enclosing scope id when the adapter can identify it. */
  readonly scopeId: string | undefined
  /** Enclosing caller symbol id when the adapter can identify it. */
  readonly callerSymbolId: string | undefined
  /** Normalized syntactic call form. */
  readonly form: CallForm
  /** Called member, function, or constructor name. */
  readonly name: string
  /** Receiver or namespace name for member/static calls. */
  readonly receiverName: string | undefined
  /** Direct target candidate name when available. */
  readonly targetName: string | undefined
  /** Call arity when statically known. */
  readonly arity: number | undefined
  /** Source location of the call syntax. */
  readonly location: SourceLocation
  /** Optional deterministic adapter metadata for diagnostics or tests. */
  readonly metadata: Readonly<Record<string, unknown>> | undefined
}

/**
 * Deterministic dependency edge resolved from binding and call facts.
 */
export interface ResolvedDependency {
  /** Source symbol id for the dependency relation. */
  readonly sourceSymbolId: string
  /** Target symbol id for the dependency relation. */
  readonly targetSymbolId: string
  /** Persisted dependency relation type emitted by scoped resolution. */
  readonly relationType:
    | typeof RelationType.Calls
    | typeof RelationType.Constructs
    | typeof RelationType.UsesType
  /** Human-readable deterministic reason for accepting the edge. */
  readonly reason: string
  /** Source location that produced the dependency. */
  readonly location: SourceLocation
}
