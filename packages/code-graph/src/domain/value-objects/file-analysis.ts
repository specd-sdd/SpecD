import { type FileNode } from './file-node.js'
import { type DocumentNode } from './document-node.js'
import { type SymbolNode } from './symbol-node.js'
import { type ImportDeclaration } from './import-declaration.js'
import { type BindingFact } from './binding-fact.js'
import { type CallFact } from './call-fact.js'

/**
 * ParserState allows adapters to preserve small, compact, per-file parser-specific
 * runtime facts between Pass 1 and Pass 2.
 */
export interface ParserState {
  readonly kind: string
  readonly [key: string]: unknown
}

/**
 * AdapterSessionState allows adapters to share small, deterministic run-scoped
 * caches across files in the same indexing run.
 */
export interface AdapterSessionState {
  readonly kind: string
  readonly [key: string]: unknown
}

/**
 * Represents the complete compact result of one adapter analysis pass over one file.
 */
export interface FileAnalysisDraft {
  readonly language: string
  readonly namespace?: string
  readonly fileNode?: FileNode
  readonly documentNode?: DocumentNode
  readonly symbols: readonly SymbolNode[]
  readonly imports: readonly ImportDeclaration[]
  readonly bindingFacts: readonly BindingFact[]
  readonly callFacts: readonly CallFact[]
  readonly parserState?: ParserState
}

/**
 * Represents the registered file analysis, augmented with run-level file metadata and IDs.
 */
export interface FileAnalysis extends FileAnalysisDraft {
  readonly fileId: number
  readonly filePath: string
  readonly contentHash: string
  readonly workspace: string
  readonly configRelativePath: string
}
