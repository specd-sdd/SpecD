import type { IndexCoverageStatus } from './index-session.js'
import type { LogicalDeclarationDiagnostic } from './symbol-reference.js'
import type { ImportDiagnostic, ImportUnresolvedReason } from './language-adapter-facets.js'
import type { SizeSkippedFile, SizeExemptFile } from './index-event.js'

/**
 * Describes an error encountered while indexing a specific file.
 */
export interface IndexError {
  readonly filePath: string
  readonly message: string
}

/**
 * Per-workspace breakdown of indexing results.
 */
export interface WorkspaceIndexBreakdown {
  readonly name: string
  readonly filesDiscovered: number
  readonly filesIndexed: number
  readonly documentsIndexed: number
  readonly filesSkipped: number
  readonly filesRemoved: number
  readonly specsDiscovered: number
  readonly specsIndexed: number
}

/** Stable count and elapsed time for one observable indexing phase. */
export interface IndexPhaseMetric {
  readonly count: number
  readonly durationMs: number
}

/** Named semantic and persistence phase metrics for performance diagnostics. */
export interface IndexPhaseMetrics {
  readonly importResolution: IndexPhaseMetric
  readonly dependencyFacts: IndexPhaseMetric
  readonly adapterRelations: IndexPhaseMetric
  readonly reexports: IndexPhaseMetric
  readonly hierarchyOverrides: IndexPhaseMetric
  readonly persistence: IndexPhaseMetric
  readonly searchIndexRebuild: IndexPhaseMetric
}

/** Stable reason why one persisted implementation link could not become coverage. */
export type IndexCoverageDiagnosticReason =
  | 'FILE_NOT_INDEXED'
  | 'SYMBOL_NOT_FOUND'
  | 'SYMBOL_AMBIGUOUS'
  | 'COVERAGE_NOT_APPLICABLE'

/** Diagnostic evidence for one unresolved persisted implementation link. */
export interface IndexCoverageDiagnostic {
  readonly specId: string
  readonly filePath: string
  readonly symbolName?: string
  readonly reason: IndexCoverageDiagnosticReason
}

/** Complete coverage evidence produced by one indexing run. */
export interface IndexRunCoverageSummary {
  readonly total: number
  readonly byStatus: Readonly<Record<IndexCoverageStatus, number>>
  readonly reasons: readonly string[]
}

/**
 * Non-persisted summary of package imports that stayed unresolved during one run.
 *
 * The full list can be as large as the number of imports in the corpus, so the run keeps
 * exact counts per reason and a bounded sample per reason.
 */
export interface ImportDiagnosticSummary {
  /** Number of unresolved package imports recorded by the run, excluding external ones. */
  readonly total: number
  /** Exact count per unresolved reason; reasons that never occurred are omitted. */
  readonly byReason: Readonly<Partial<Record<ImportUnresolvedReason, number>>>
  /** At most {@link IMPORT_DIAGNOSTIC_SAMPLE_LIMIT} diagnostics per reason, in discovery order. */
  readonly samples: readonly ImportDiagnostic[]
  /**
   * Imports of packages that no workspace declares. They are external dependencies, not
   * failures, so they are counted here and excluded from `total`, `byReason`, and `samples`.
   */
  readonly externalPackageImports: number
  /**
   * Language identifiers of each registered adapter that does not provide the package resolution
   * facet, one entry per adapter. A listing is not an unresolved import and is never counted in
   * `total`, `byReason`, or `samples`.
   */
  readonly adaptersWithoutPackageResolution: readonly string[]
}

/** Maximum number of sampled import diagnostics kept per reason. */
export const IMPORT_DIAGNOSTIC_SAMPLE_LIMIT = 20

/** Maximum number of size-skipped files reported in largestSkippedForSize. */
export const SIZE_SKIP_LIST_LIMIT = 25

/**
 * Summary of an indexing operation including counts and errors.
 */
export interface IndexResult {
  readonly filesDiscovered: number
  readonly filesIndexed: number
  readonly documentsIndexed: number
  readonly filesRemoved: number
  readonly filesSkipped: number
  /** Number of files skipped because their byte size exceeded the effective limit. */
  readonly filesSkippedForSize: number
  /** Sample of up to {@link SIZE_SKIP_LIST_LIMIT} largest skipped files, sorted descending by size. */
  readonly largestSkippedForSize: readonly SizeSkippedFile[]
  /**
   * Files whose size exceeds the effective limit and that are indexed because they are exempt.
   * The list covers every such file in the indexed set, including exempt files that an incremental
   * run did not need to analyse again because their content was unchanged.
   */
  readonly sizeExemptAnalysed: readonly SizeExemptFile[]
  readonly specsDiscovered: number
  readonly specsIndexed: number
  /** Files or specs that failed to produce their indexed content. */
  readonly errors: readonly IndexError[]
  /**
   * Problems found while resolving packages or linking re-exports. They do not mean that a file or
   * spec failed: the run completed and everything it produced is valid.
   */
  readonly diagnostics: readonly IndexError[]
  readonly duration: number
  readonly workspaces: readonly WorkspaceIndexBreakdown[]
  readonly vcsRef: string | null
  readonly graphFingerprint: string
  readonly fullRebuild: boolean
  readonly fullRebuildReason: string | null
  readonly phaseMetrics: IndexPhaseMetrics
  readonly coverage: IndexRunCoverageSummary
  readonly coverageDiagnostics: readonly IndexCoverageDiagnostic[]
  /** Logical-identity collisions whose declarations were kept physical-only. */
  readonly logicalDiagnostics: readonly LogicalDeclarationDiagnostic[]
  /** Unresolved package imports of this run. Never persisted and never part of the fingerprint. */
  readonly importDiagnostics: ImportDiagnosticSummary
}
