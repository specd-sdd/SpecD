import { type SymbolNode } from './symbol-node.js'
import { type SpecNode } from './spec-node.js'
import { type DocumentNode } from './document-node.js'
import { type Relation } from './relation.js'
import { type FileAnalysis, type FileAnalysisDraft } from './file-analysis.js'
import { type FileCategory } from './file-node.js'
import { type ParserResourceScope } from './parser-resource-scope.js'
import {
  type DeclarationOccurrence,
  type LocalBinding,
  type LogicalDeclarationDiagnostic,
  type LogicalSymbol,
  type PublicBinding,
  type ResolutionStep,
  type SymbolSpace,
} from './symbol-reference.js'

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
  readonly projectRelativePath: string
  readonly language: string
  readonly contentHash: string
  readonly workspace: string
  /** File category; defaults to `'source'` when omitted. */
  readonly category?: FileCategory
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
   * Scope holding parser-owned resources for the file currently being analysed.
   */
  readonly parserResources: ParserResourceScope

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
   * Finds one registered symbol by its exact id, in any workspace.
   * @param symbolId - Symbol id.
   * @returns The symbol, or `undefined` when it is not registered.
   */
  findSymbolById(symbolId: string): SymbolNode | undefined

  /**
   * Finds a symbol's ID by its qualified name.
   * @param qualifiedName - Full qualified symbol name.
   * @param options - Options; when `includeTests` is true, test-file symbols are also considered.
   * @param options.includeTests - When true, test-file symbols are also considered.
   */
  findSymbolByQualifiedName(
    qualifiedName: string,
    options?: { readonly includeTests?: boolean },
  ): string | undefined

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
   * @param options - Options; when `includeTests` is true, returns production and test symbols (production wins on duplicates).
   * @param options.includeTests - When true, returns production and test symbols (production wins on duplicates).
   */
  getQualifiedNames(options?: { readonly includeTests?: boolean }): ReadonlyMap<string, string>

  /** Returns declaration occurrences grouped by their logical identity. */
  getDeclarationsByLogicalId(): ReadonlyMap<string, readonly DeclarationOccurrence[]>

  /** Returns logical symbols recorded for this session. */
  getLogicalSymbols(): readonly LogicalSymbol[]

  /**
   * Returns logical-collision diagnostics gathered while registering analyses.
   * @returns Deterministically ordered diagnostics.
   */
  getLogicalDiagnostics(): readonly LogicalDeclarationDiagnostic[]

  /** Returns public bindings recorded for this session. */
  getPublicBindings(): readonly PublicBinding[]

  /** Returns lexical bindings recorded for this session. */
  getLocalBindings(): readonly LocalBinding[]

  /**
   * Returns the public bindings stored under one surface for an exported name and symbol space.
   * @param surface - Public surface id.
   * @param exportedName - Exported spelling.
   * @param space - Symbol space of the export.
   * @returns Matching bindings in deterministic identity order, empty when none.
   */
  findPublicBindings(
    surface: string,
    exportedName: string,
    space: SymbolSpace,
  ): readonly PublicBinding[]

  /**
   * Returns the category of a registered file.
   * @param filePath - Workspace-prefixed file path.
   * @returns The file category (`'source'` when none was recorded), or `undefined` when the file is not registered.
   */
  getFileCategory(filePath: string): FileCategory | undefined

  /**
   * Returns the primary declaration symbol id of a logical symbol: the lowest symbol id
   * among definition occurrences, falling back to the lowest symbol id of any occurrence.
   * @param logicalId - Logical symbol id.
   * @returns The symbol id, or `undefined` when the logical symbol has no declaration.
   */
  getPrimaryDeclarationSymbolId(logicalId: string): string | undefined

  /** Returns resolution steps recorded for this session. */
  getResolutionSteps(): readonly ResolutionStep[]

  /**
   * Merges adapter-emitted re-export bindings and steps into the session.
   * @param facts - Bindings and steps to add.
   * @param facts.publicBindings - Public bindings emitted by an adapter.
   * @param facts.steps - Resolution steps emitted by an adapter.
   */
  addReferenceFacts(facts: {
    readonly publicBindings: readonly PublicBinding[]
    readonly steps: readonly ResolutionStep[]
  }): void
}
