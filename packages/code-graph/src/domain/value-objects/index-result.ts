import type { IndexCoverageStatus } from './index-session.js'

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
 * Summary of an indexing operation including counts and errors.
 */
export interface IndexResult {
  readonly filesDiscovered: number
  readonly filesIndexed: number
  readonly documentsIndexed: number
  readonly filesRemoved: number
  readonly filesSkipped: number
  readonly specsDiscovered: number
  readonly specsIndexed: number
  readonly errors: readonly IndexError[]
  readonly duration: number
  readonly workspaces: readonly WorkspaceIndexBreakdown[]
  readonly vcsRef: string | null
  readonly graphFingerprint: string
  readonly fullRebuild: boolean
  readonly fullRebuildReason: string | null
  readonly phaseMetrics: IndexPhaseMetrics
  readonly coverage: IndexRunCoverageSummary
  readonly coverageDiagnostics: readonly IndexCoverageDiagnostic[]
}
