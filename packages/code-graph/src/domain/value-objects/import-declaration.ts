import { type ImportDeclarationKind } from './import-declaration-kind.js'
import { type SourceRange } from './symbol-node.js'

/**
 * A parsed import declaration extracted from source code by a language adapter.
 * Contains only syntactic information — no resolution or I/O.
 */
export interface ImportDeclaration {
  /** The name used locally in the importing file (may differ from original via aliasing). */
  readonly localName: string
  /** The name as declared in the source module. */
  readonly originalName: string
  /** The raw import specifier string (e.g. './utils.js', '@specd/core', 'os'). */
  readonly specifier: string
  /** True if the specifier is a relative path (starts with . or /). */
  readonly isRelative: boolean
  /** Optional normalized import form used by shared resolution. */
  readonly kind?: ImportDeclarationKind | undefined
  /** Source range of the import syntax, when the adapter records it. */
  readonly range?: SourceRange | undefined
}
