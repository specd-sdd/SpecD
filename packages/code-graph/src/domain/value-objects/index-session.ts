import { type SymbolNode } from './symbol-node.js'
import { type SpecNode } from './spec-node.js'
import { type DocumentNode } from './document-node.js'
import { type Relation } from './relation.js'
import { type FileAnalysis, type FileAnalysisDraft } from './file-analysis.js'
import { type DeclarationOccurrence } from './symbol-reference.js'

/** The evidence state recorded for every source target considered by an index run. */
export const IndexCoverageStatus = {
  Indexed: 'indexed',
  Excluded: 'excluded',
  Unsupported: 'unsupported',
  ParseFailed: 'parse-failed',
  Partial: 'partial',
} as const

/** A stable index-coverage state. */
export type IndexCoverageStatus = (typeof IndexCoverageStatus)[keyof typeof IndexCoverageStatus]

/** Persisted evidence that explains whether a source target can support absence claims. */
export interface IndexCoverage {
  /** Workspace-prefixed source path. */
  readonly filePath: string
  /** Content hash observed while considering the target. */
  readonly contentHash: string | undefined
  /** Indexing outcome. */
  readonly status: IndexCoverageStatus
  /** Stable machine-readable explanation for non-complete evidence. */
  readonly reason: string | undefined
  /** Adapter capabilities used while producing this evidence. */
  readonly capabilities: readonly string[]
}

/**
 * Input parameters for registering a discovered file in the index session.
 */
export interface RegisterFileInput {
  readonly filePath: string
  readonly configRelativePath: string
  readonly language: string
  readonly contentHash: string
  readonly workspace: string
}

/**
 * Input parameters for registering the pass-1 analysis result of a file.
 */
export interface RegisterAnalysisInput {
  readonly filePath: string
  readonly analysis: FileAnalysisDraft
}

/**
 * Interface for the shared in-memory indexing session that coordinates lookup structures,
 * file-level analysis results, and relations during an indexing run.
 */
export interface IndexSession {
  /**
   * Registers a file and returns its numeric ID.
   */
  registerFile(input: RegisterFileInput): number

  /**
   * Registers a file analysis draft and returns the complete FileAnalysis object.
   */
  registerAnalysis(input: RegisterAnalysisInput): FileAnalysis

  /**
   * Retrieves the numeric ID of a registered file path.
   */
  getFileId(filePath: string): number | undefined

  /**
   * Retrieves the analysis of a registered file path.
   */
  getAnalysis(filePath: string): FileAnalysis | undefined

  /**
   * Returns a set of all registered file paths.
   */
  getAllFilePaths(): ReadonlySet<string>

  /**
   * Finds all symbols registered for a specific file path.
   */
  findSymbolsByFile(filePath: string): readonly SymbolNode[]

  /**
   * Finds all symbols matching a simple name, optionally filtered by file path prefix.
   */
  findSymbolsByName(name: string, filePrefix?: string): readonly SymbolNode[]

  /**
   * Finds a symbol's ID by its qualified name.
   */
  findSymbolByQualifiedName(qualifiedName: string): string | undefined

  /**
   * Finds all specifications linked to a symbol.
   */
  findSpecsBySymbol(symbolId: string): readonly SpecNode[]

  /**
   * Finds all symbols covered by a specification.
   */
  findSymbolsBySpec(specId: string): readonly SymbolNode[]

  /**
   * Registers a document node in the session.
   */
  registerDocument(document: DocumentNode): void

  /**
   * Registers a specification node in the session.
   */
  registerSpec(spec: SpecNode): void

  /**
   * Adds resolved relations to the session, deduplicating them.
   */
  addRelations(relations: readonly Relation[]): void

  /**
   * Retrieves all unique relations registered in the session.
   */
  getRelations(): readonly Relation[]

  /**
   * Retrieves adapter-specific run-scoped cache state.
   */
  getAdapterState<T>(adapterKey: string): T | undefined

  /**
   * Sets adapter-specific run-scoped cache state.
   */
  setAdapterState<T>(adapterKey: string, state: T): void

  /**
   * Retrieves the qualified name mapping.
   */
  getQualifiedNames(): ReadonlyMap<string, string>

  /** Returns declaration occurrences grouped by their logical identity. */
  getDeclarationsByLogicalId(): ReadonlyMap<string, readonly DeclarationOccurrence[]>
}
