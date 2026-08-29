/**
 * Categories classifying software architectural capabilities.
 */
export type SpecCategory =
  | 'APPLICATION_USE_CASE'
  | 'CORE_DOMAIN_ENTITY'
  | 'PORT_OR_CONTRACT'
  | 'INFRASTRUCTURE_SUBSYSTEM'
  | 'DOMAIN_SERVICE'
  | 'PUBLIC_INTERFACE_API'
  | 'UTILITY_SUPPORT'

/**
 * Breakdown of the 5 objective scoring factors contributing to confidence.
 */
export interface ConfidenceBreakdown {
  /** Points awarded for indexed hotspots and caller volume (0..25). */
  readonly callerEvidence: number
  /** Points awarded for explicit classes, ports, and architectural layer clarity (0..25). */
  readonly architecturalClarity: number
  /** Points awarded for file cohesion and symbol richness (0..20). */
  readonly graphCouplingCohesion: number
  /** Points awarded for public layer export entrypoints (0..15). */
  readonly publicSurface: number
  /** Points awarded for associated test suites (0..15). */
  readonly testAlignmentEvidence: number
  /** Total computed confidence score (0..100). */
  readonly total: number
}

/**
 * Key anchor AST symbol representing a capability's primary surface.
 */
export interface AnchorSymbol {
  readonly id: string
  readonly name: string
  readonly kind: string
  readonly filePath: string
}

/**
 * Hotspot risk summary associated with candidate capability files.
 */
export interface HotspotSummary {
  readonly name: string
  readonly kind: string
  readonly filePath: string
  readonly score: number
  readonly directCallers: number
  readonly crossWorkspaceCallers: number
  readonly riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
}

/**
 * Rationale explaining why a candidate specification should exist.
 */
export interface SpecRationale {
  readonly whyNeeded: string
  readonly blastRadiusSummary: string
  readonly architecturalRole: string
  readonly keyEvidence: readonly string[]
}

/**
 * Candidate specification suggested by the discovery engine.
 */
export interface CandidateSpec {
  readonly id: string
  readonly title: string
  readonly workspace: string
  readonly category: SpecCategory
  readonly priority: 'P0 (Critical)' | 'P1 (High)' | 'P2 (Medium)'
  readonly confidence: number
  readonly confidenceBreakdown: ConfidenceBreakdown
  readonly rationale: SpecRationale
  readonly primaryFiles: readonly string[]
  readonly testFiles: readonly string[]
  readonly anchorSymbols: readonly AnchorSymbol[]
  readonly hotspots: readonly HotspotSummary[]
  readonly dependsOnSpecs: readonly string[]
  readonly isExistingSpecCovered?: boolean | undefined
}

/**
 * Summary metrics aggregated across codebase capability analysis.
 */
export interface SuggestSpecsSummary {
  readonly totalFilesAnalyzed: number
  readonly totalSymbolsAnalyzed: number
  readonly totalWorkspaces: number
  readonly totalSpecsSuggested: number
  readonly highConfidenceSpecsCount: number
  readonly codeCoveragePercentage: number
  readonly averageConfidence: number
  readonly byPriority: Readonly<Record<string, number>>
  readonly byCategory: Readonly<Record<string, number>>
  readonly uncoveredFilesCount: number
  readonly existingSpecsCount?: number
  readonly missingSpecsCount?: number
}

/**
 * Result returned by the SuggestSpecs use case.
 */
export interface SuggestSpecsResult {
  readonly result: 'ok'
  readonly targetWorkspace?: string | undefined
  readonly codeGraphStale?: boolean
  readonly summary: SuggestSpecsSummary
  readonly suggestedSpecs: readonly CandidateSpec[]
}
