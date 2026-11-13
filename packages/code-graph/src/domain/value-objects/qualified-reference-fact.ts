import { type SourceLocation } from './source-location.js'

/** Position in which a qualified reference occurs. */
export const QualifiedReferenceKind = {
  Call: 'call',
  Construct: 'construct',
  Type: 'type',
} as const

/** Union of valid qualified reference kinds. */
export type QualifiedReferenceKind =
  (typeof QualifiedReferenceKind)[keyof typeof QualifiedReferenceKind]

/**
 * Syntactic evidence of a name written as `qualifier.name`. It names no target.
 */
export interface QualifiedReferenceFact {
  /** Workspace-prefixed path of the file containing the reference. */
  readonly filePath: string
  /** Identifier before the dot, as written. */
  readonly qualifier: string
  /** Identifier after the dot, as written. */
  readonly name: string
  /** Position of the reference. */
  readonly kind: QualifiedReferenceKind
  /** Innermost declaration whose parser range contains the reference, when one exists. */
  readonly sourceSymbolId: string | undefined
  /** Parser-derived location of the reference. */
  readonly location: SourceLocation
}

/**
 * Stable identity of a fact within one file analysis.
 * @param fact - Fact to identify.
 * @returns `kind`, start line/column and `qualifier.name`, separated by NUL characters.
 */
export function qualifiedReferenceKey(fact: QualifiedReferenceFact): string {
  return [
    fact.kind,
    `${fact.location.line}:${fact.location.column}`,
    `${fact.qualifier}.${fact.name}`,
  ].join('\u0000')
}
