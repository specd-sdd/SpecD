import { type SourceLocation } from './source-location.js'

/**
 * Closed vocabulary for lexical scope ownership represented by adapter facts.
 */
export const BindingScopeKind = {
  File: 'file',
  Class: 'class',
  Method: 'method',
  Function: 'function',
  Block: 'block',
} as const

/**
 * Union type of valid binding scope kinds.
 */
export type BindingScopeKind = (typeof BindingScopeKind)[keyof typeof BindingScopeKind]

/**
 * Closed vocabulary for the source of a deterministic binding fact.
 */
export const BindingSourceKind = {
  Local: 'local',
  Parameter: 'parameter',
  ReturnType: 'return-type',
  Property: 'property',
  ClassManaged: 'class-managed',
  Inherited: 'inherited',
  FileGlobal: 'file-global',
  ImportedType: 'imported-type',
  FrameworkManaged: 'framework-managed',
  ConstructorCall: 'constructor-call',
  Alias: 'alias',
  Receiver: 'receiver',
} as const

/**
 * Union type of valid binding source kinds.
 */
export type BindingSourceKind = (typeof BindingSourceKind)[keyof typeof BindingSourceKind]

/**
 * Lexical scope owned by a source file, type, method, function, or block.
 */
export interface BindingScope {
  /** Stable scope identifier unique within the indexed file. */
  readonly id: string
  /** The syntactic kind of scope represented by this value. */
  readonly kind: BindingScopeKind
  /** Workspace-prefixed file path containing the scope. */
  readonly filePath: string
  /** Parent scope identifier, or undefined for the root file scope. */
  readonly parentId: string | undefined
  /** Owning symbol id for class, method, or function scopes when known. */
  readonly ownerSymbolId: string | undefined
  /** Source location where the scope begins. */
  readonly start: SourceLocation
  /** Source location where the scope ends, when known. */
  readonly end: SourceLocation | undefined
}

/**
 * Deterministic source-language binding fact emitted by a language adapter.
 */
export interface BindingFact {
  /** Visible local name or receiver token, such as `repo`, `this`, or `self`. */
  readonly name: string
  /** Workspace-prefixed file path containing the binding. */
  readonly filePath: string
  /** Scope where the binding is visible. */
  readonly scopeId: string
  /** Source category that explains why the binding exists. */
  readonly sourceKind: BindingSourceKind
  /** Source location of the binding syntax. */
  readonly location: SourceLocation
  /** Target symbol or type name candidate when no symbol id is known yet. */
  readonly targetName: string | undefined
  /** Resolved target symbol id when the adapter can provide one deterministically. */
  readonly targetSymbolId: string | undefined
  /** Target file path candidate when the fact is file-oriented. */
  readonly targetFilePath: string | undefined
  /** Optional deterministic adapter metadata for diagnostics or tests. */
  readonly metadata: Readonly<Record<string, unknown>> | undefined
}
