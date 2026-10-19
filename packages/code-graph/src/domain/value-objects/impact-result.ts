import { type FileCategory } from './file-node.js'
import { type RelationType } from './relation-type.js'
import { type RiskLevel } from './risk-level.js'
import { type SourceLocation } from './source-location.js'
import { type SymbolKind } from './symbol-kind.js'
import { type SymbolNode } from './symbol-node.js'
import {
  type DeclarationOccurrence,
  type LogicalSymbol,
  type ResolvedSymbolTarget,
} from './symbol-reference.js'

/** Supported result categories for an impact query. */
export const IMPACT_RESULT_TYPES = ['files', 'symbols', 'specs'] as const

/** A supported category of results to materialize for an impact query. */
export type ImpactResultType = (typeof IMPACT_RESULT_TYPES)[number]

/**
 * Counts of files excluded from calculations or traversal due to category filtering.
 */
export interface OmittedCounts {
  readonly tests: number
  readonly ignored: number
}

/**
 * Common category filter options shared by impact, hotspots, and search.
 */
export interface CategoryFilterOptions {
  /** File categories eligible for materialization and traversal. Defaults to `['source']`. */
  readonly categories?: readonly FileCategory[] | undefined
  /** Whether test files are included. When true, supplements categories. */
  readonly includeTests?: boolean | undefined
  /** Whether ignored files are included. When true, supplements categories. */
  readonly includeIgnored?: boolean | undefined
}

/**
 * Resolves the effective admitted file categories from category filter options.
 * Defaults to `['source']` when no categories are specified.
 * `includeTests` adds `'test'`, and `includeIgnored` adds `'ignored'`.
 * @param filter - Optional category filter options.
 * @returns Array of resolved admitted file categories.
 */
export function resolveAdmittedCategories(filter?: CategoryFilterOptions): FileCategory[] {
  let categories: Set<FileCategory>
  if (filter?.categories !== undefined && filter.categories.length > 0) {
    categories = new Set(filter.categories)
  } else {
    categories = new Set(['source'])
  }
  if (filter?.includeTests) {
    categories.add('test')
  }
  if (filter?.includeIgnored) {
    categories.add('ignored')
  }
  return [...categories].sort()
}

/**
 * Optional, immutable constraints for an impact query.
 *
 * Omitted fields do not constrain the query. When both workspace lists contain
 * the same workspace, `excludeWorkspaces` takes precedence over `workspaces`.
 * Consumers must treat every supplied array as immutable.
 */
export interface ImpactResultFilter extends CategoryFilterOptions {
  /** Result categories to materialize; omission preserves all categories. */
  readonly types?: readonly ImpactResultType[]
  /** Symbol kinds eligible for materialization and traversal. */
  readonly kinds?: readonly SymbolKind[]
  /** Workspaces eligible for materialization and traversal. */
  readonly workspaces?: readonly string[]
  /** Workspaces to exclude, taking precedence over `workspaces`. */
  readonly excludeWorkspaces?: readonly string[]
}

/**
 * Result of analyzing the impact of modifying a single symbol.
 */
export interface AffectedSymbol {
  readonly id: string
  readonly name: string
  readonly filePath: string
  readonly line: number
  readonly depth: number
}

/**
 * Result of analyzing the impact of modifying a single symbol.
 */
export interface ImpactResult {
  readonly target: string
  readonly directDependents: number
  readonly indirectDependents: number
  readonly transitiveDependents: number
  readonly riskLevel: RiskLevel
  readonly affectedFiles: readonly string[]
  readonly affectedSymbols: readonly AffectedSymbol[]
  readonly affectedSpecs: readonly string[]
  readonly affectedProcesses: readonly string[]
  readonly omittedCounts: OmittedCounts
  readonly omittedFiles?: {
    readonly tests: readonly string[]
    readonly ignored: readonly string[]
  }
}

/** One file or symbol relation proving that a spec covers an impacted resource. */
export interface CoveringSpecEvidence {
  readonly kind: 'file' | 'symbol'
  readonly target: string
  readonly depth: number
  readonly declarations?: readonly string[] | undefined
}

/** Deduplicated covering spec with its shallowest depth and complete evidence. */
export interface CoveringSpecImpact {
  readonly specId: string
  readonly minDepth: number
  readonly evidence: readonly CoveringSpecEvidence[]
}

/**
 * Aggregated impact result for all symbols within a file.
 */
export interface FileImpactResult extends ImpactResult {
  readonly symbols: readonly ImpactResult[]
  readonly coveringSpecs: readonly CoveringSpecImpact[]
}

/** Impact result for a spec requirement. */
export type SpecImpactResult = ImpactResult

/** Reconstructed physical dependency edge proving why a target is impacted. */
export interface PhysicalDependencyEvidence {
  readonly relationType: RelationType
  readonly sourceDeclarationId: string
  readonly targetDeclarationId: string
  readonly sourceLocation: SourceLocation | undefined
  readonly targetLocation: SourceLocation | undefined
  readonly depth: number
}

/** Logical target impacted by a change, aggregating all declaration occurrences. */
export interface LogicalAffectedTarget {
  readonly kind: 'logical-target'
  readonly logicalSymbol: LogicalSymbol
  readonly declarations: readonly DeclarationOccurrence[]
  readonly depth: number
  readonly evidence: readonly PhysicalDependencyEvidence[]
}

/** Physical declaration with no logical target impacted by a change. */
export interface PhysicalOnlyAffectedTarget {
  readonly kind: 'physical-only'
  readonly declaration: SymbolNode
  readonly depth: number
  readonly evidence: readonly PhysicalDependencyEvidence[]
}

/** Discriminated union of semantic affected targets. */
export type SemanticAffectedTarget = LogicalAffectedTarget | PhysicalOnlyAffectedTarget

/** Explicit impact counts separating unique logical targets from physical evidence. */
export interface SemanticImpactCounts {
  readonly directLogicalTargets: number
  readonly indirectLogicalTargets: number
  readonly transitiveLogicalTargets: number
  readonly physicalOnlyTargets: number
  readonly physicalDeclarationOccurrences: number
}

/** Rich semantic impact result preserving discriminated target and occurrence evidence. */
export interface ResolvedSymbolImpactResult extends ImpactResult {
  readonly resolvedTarget: ResolvedSymbolTarget
  readonly semanticAffectedTargets: readonly SemanticAffectedTarget[]
  readonly physicalEvidence: readonly PhysicalDependencyEvidence[]
  readonly semanticCounts: SemanticImpactCounts
  readonly coveringSpecs: readonly CoveringSpecImpact[]
}
