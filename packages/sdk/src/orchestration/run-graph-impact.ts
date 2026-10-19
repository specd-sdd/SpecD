import {
  type CodeGraphProvider,
  type CoveringSpecEvidence,
  type CoveringSpecImpact,
  type FileImpactResult,
  type ImpactResult,
  type ImpactResultFilter,
  type LogicalSymbol,
  type PublicBinding,
  type ResolutionCandidate,
  type ResolutionStep,
  type RiskLevel,
  SpecNotFoundError as GraphSpecNotFoundError,
  type SymbolNode,
  type SymbolResolutionResult,
  type DeclarationOccurrence,
  type PhysicalDependencyEvidence,
  type SemanticImpactCounts,
  type ResolvedSymbolImpactResult as DomainResolvedSymbolImpactResult,
  type ResolvedSymbolTarget,
  type SourceLocation,
} from '@specd/code-graph'
import { SpecdError, type SpecdConfig } from '@specd/core'
import { type SdkHostContext } from '../composition/host-context.js'
import { withOpenGraphProvider } from '../composition/with-open-graph-provider.js'
import { splitWorkspaceIdentity, toProjectRelativePath } from './project-relative-path.js'

/** Direction for impact graph traversals. */
export type GraphImpactDirection =
  | 'upstream'
  | 'downstream'
  | 'both'
  | 'dependents'
  | 'dependencies'

/** Input options for {@link runGraphImpact}. */
export interface RunGraphImpactInput {
  /** File selectors to analyze. */
  readonly files?: readonly string[]
  /** Symbol selector to analyze. */
  readonly symbol?: string
  /** Spec identifier to analyze. */
  readonly spec?: string
  /** Public export route name to analyze. */
  readonly export?: string
  /** Public surface containing the export (e.g. workspace:path, config-relative, or absolute). */
  readonly from?: string
  /** Alias for `from`. */
  readonly surface?: string
  /** Traversal direction (defaults to upstream/dependents). */
  readonly direction?: GraphImpactDirection
  /** Maximum traversal depth (defaults to 3). */
  readonly depth?: number
  /** Provider-side result filter. */
  readonly filter?: ImpactResultFilter
  /** Optional pre-opened graph provider. When provided, lifecycle is caller-owned. */
  readonly provider?: CodeGraphProvider
}

/** Error thrown when a file selector is empty, not found, or ambiguous. */
export class GraphSelectorError extends SpecdError {
  /** Error code identifier. */
  override get code(): string {
    return 'INVALID_GRAPH_SELECTOR'
  }

  /**
   * Creates a new GraphSelectorError.
   * @param message - Error message
   */
  constructor(message: string) {
    super(message)
  }
}

/** Projected affected symbol with projectRelativePath. */
export interface ProjectedAffectedSymbol {
  readonly id: string
  readonly name: string
  readonly filePath: string
  readonly projectRelativePath: string
  readonly line: number
  readonly depth: number
}

/** Covering-spec evidence with a repository-relative path for file evidence. */
export interface ProjectedCoveringSpecEvidence extends CoveringSpecEvidence {
  readonly projectRelativePath?: string | undefined
}

/** Covering spec whose file evidence exposes `projectRelativePath`. */
export interface ProjectedCoveringSpecImpact extends Omit<CoveringSpecImpact, 'evidence'> {
  readonly evidence: readonly ProjectedCoveringSpecEvidence[]
}

/** Public binding with the project-relative form of its surface. */
export interface ProjectedPublicBinding extends PublicBinding {
  readonly projectRelativeSurface: string
}

/** Resolution candidate whose declaration locations are projected. */
export interface ProjectedResolutionCandidate extends Omit<ResolutionCandidate, 'declarations'> {
  readonly declarations: readonly ProjectedImpactDeclarationOccurrence[]
}

/** Symbol resolution whose nested locations are projected to `projectRelativePath`. */
export interface ProjectedSymbolResolutionResult extends Omit<
  SymbolResolutionResult,
  'resolvedTarget' | 'candidates'
> {
  readonly resolvedTarget: ProjectedResolvedSymbolTarget | null
  readonly candidates: readonly ProjectedResolutionCandidate[]
}

/** Single file impact result with unified projectRelativePath. */
export interface SingleFileImpactResult {
  readonly kind: 'file'
  readonly canonicalPath: string
  readonly projectRelativePath: string
  readonly workspace: string
  readonly riskLevel: RiskLevel
  readonly directDepsCount: number
  readonly indirectDepsCount: number
  readonly transitiveDepsCount: number
  readonly affectedFilesCount: number
  readonly directDependents: number
  readonly indirectDependents: number
  readonly transitiveDependents: number
  readonly affectedFiles: readonly string[]
  readonly affectedSymbols: readonly ProjectedAffectedSymbol[]
  readonly symbols: readonly ImpactResult[]
  readonly coveringSpecs: readonly ProjectedCoveringSpecImpact[]
  readonly omittedCounts: { readonly tests: number; readonly ignored: number }
}

/** Multi-file impact result with unified projectRelativeTargets. */
export interface MultiFileImpactResult {
  readonly kind: 'files'
  readonly targets: readonly string[]
  readonly projectRelativeTargets: readonly string[]
  readonly riskLevel: RiskLevel
  readonly directDepsCount: number
  readonly indirectDepsCount: number
  readonly transitiveDepsCount: number
  readonly affectedFilesCount: number
  readonly directDependents: number
  readonly indirectDependents: number
  readonly transitiveDependents: number
  readonly affectedFiles: readonly string[]
  readonly coveringSpecs: readonly ProjectedCoveringSpecImpact[]
  readonly omittedCounts: { readonly tests: number; readonly ignored: number }
  readonly perFile: readonly {
    readonly file: string
    readonly projectRelativePath: string
    readonly result: {
      readonly riskLevel: RiskLevel
      readonly directDependents: number
      readonly indirectDependents: number
      readonly transitiveDependents: number
      readonly affectedFiles: readonly string[]
      readonly symbols: readonly ImpactResult[]
    }
  }[]
}

/** Missing symbol outcome. */
export interface SymbolNotFoundImpactResult {
  readonly kind: 'symbol'
  readonly status: 'not_found'
  readonly symbol: string
}

/** Symbol selector the graph could not decide, with the resolver's stable reason. */
export interface SymbolUnresolvedImpactResult {
  readonly kind: 'symbol'
  readonly status: 'unresolved'
  readonly symbol: string
  readonly reasonCode: string
}

/** Ambiguous symbol candidates outcome. */
export interface SymbolAmbiguousImpactResult {
  readonly kind: 'symbol'
  readonly status: 'ambiguous'
  readonly symbol: string
  readonly totalCandidates: number
  readonly candidates: readonly {
    readonly symbol: SymbolNode
    readonly projectRelativePath: string
  }[]
}

/** Contributing declaration occurrence projected with project-relative location path. */
export interface ProjectedImpactDeclarationOccurrence extends Omit<
  DeclarationOccurrence,
  'location'
> {
  readonly location: ProjectedSourceLocation
  readonly projectRelativePath: string
}

/** Source location whose repository-relative projection is guaranteed. */
export interface ProjectedSourceLocation extends SourceLocation {
  readonly projectRelativePath: string
}

/** Physical dependency evidence projected with optional project-relative paths. */
export interface ProjectedPhysicalDependencyEvidence extends Omit<
  PhysicalDependencyEvidence,
  'sourceLocation' | 'targetLocation'
> {
  readonly sourceLocation: ProjectedSourceLocation | undefined
  readonly targetLocation: ProjectedSourceLocation | undefined
  readonly sourceProjectRelativePath?: string | undefined
  readonly targetProjectRelativePath?: string | undefined
}

/** Resolution target with every declaration location projected for public consumption. */
export type ProjectedResolvedSymbolTarget =
  | {
      readonly kind: 'logical-target'
      readonly logicalSymbol: LogicalSymbol
      readonly declarations: readonly ProjectedImpactDeclarationOccurrence[]
      readonly path: readonly ResolutionStep[]
    }
  | {
      readonly kind: 'declaration'
      readonly declaration: ProjectedImpactDeclarationOccurrence
      readonly logicalSymbol: LogicalSymbol | undefined
      readonly path: readonly ResolutionStep[]
    }
  | {
      readonly kind: 'public-binding'
      readonly binding: PublicBinding
      readonly logicalSymbol: LogicalSymbol
      readonly declarations: readonly ProjectedImpactDeclarationOccurrence[]
      readonly path: readonly ResolutionStep[]
    }

/** Logical affected target projected with project-relative locations. */
export interface ProjectedLogicalAffectedTarget {
  readonly kind: 'logical-target'
  readonly logicalSymbol: LogicalSymbol
  readonly declarations: readonly ProjectedImpactDeclarationOccurrence[]
  readonly depth: number
  readonly evidence: readonly ProjectedPhysicalDependencyEvidence[]
}

/** Physical-only affected target projected with project-relative paths. */
export interface ProjectedPhysicalOnlyAffectedTarget {
  readonly kind: 'physical-only'
  readonly declaration: SymbolNode
  readonly projectRelativePath: string
  readonly depth: number
  readonly evidence: readonly ProjectedPhysicalDependencyEvidence[]
}

/** Discriminated union of projected semantic affected targets. */
export type ProjectedSemanticAffectedTarget =
  | ProjectedLogicalAffectedTarget
  | ProjectedPhysicalOnlyAffectedTarget

/** Resolved symbol impact result with unified projectRelativePath. */
export interface ResolvedSymbolImpactResult {
  readonly kind: 'symbol'
  readonly status: 'resolved'
  /** Target kind from resolution. */
  readonly targetKind: 'logical-target' | 'declaration' | 'public-binding'
  /** Discriminated resolution target. */
  readonly resolvedTarget: ProjectedResolvedSymbolTarget
  /** Canonical logical symbol when present. */
  readonly logicalSymbol?: LogicalSymbol | undefined
  /** Contributing declarations projected with projectRelativePath. */
  readonly declarations: readonly ProjectedImpactDeclarationOccurrence[]
  /** @deprecated Read declarations[0] or resolvedTarget; retained for backwards compatibility. */
  readonly symbol: SymbolNode
  readonly projectRelativePath: string
  readonly riskLevel: RiskLevel
  readonly directDepsCount: number
  readonly indirectDepsCount: number
  readonly transitiveDepsCount: number
  readonly affectedFilesCount: number
  readonly omittedCounts: { readonly tests: number; readonly ignored: number }
  readonly semanticCounts: SemanticImpactCounts
  readonly semanticAffectedTargets: readonly ProjectedSemanticAffectedTarget[]
  readonly physicalEvidence: readonly ProjectedPhysicalDependencyEvidence[]
  readonly coveringSpecs?: readonly ProjectedCoveringSpecImpact[] | undefined
  readonly impact: {
    readonly target: string
    readonly riskLevel: RiskLevel
    readonly directDependents: number
    readonly indirectDependents: number
    readonly transitiveDependents: number
    readonly affectedFiles: readonly string[]
    readonly affectedSymbols: readonly ProjectedAffectedSymbol[]
    readonly affectedSpecs?: readonly string[] | undefined
    readonly affectedProcesses?: readonly string[] | undefined
    readonly coveringSpecs?: readonly ProjectedCoveringSpecImpact[] | undefined
    readonly omittedCounts?: { readonly tests: number; readonly ignored: number } | undefined
  }
}

/** Spec impact result with unified projectRelativePath for affected files. */
export interface SpecImpactResult {
  readonly kind: 'spec'
  readonly spec: string
  readonly riskLevel: RiskLevel
  readonly directDepsCount: number
  readonly indirectDepsCount: number
  readonly transitiveDepsCount: number
  readonly affectedFilesCount: number
  readonly omittedCounts: { readonly tests: number; readonly ignored: number }
  readonly impact: {
    readonly target: string
    readonly specId?: string | undefined
    readonly riskLevel: RiskLevel
    readonly directDependents: number
    readonly indirectDependents: number
    readonly transitiveDependents: number
    readonly affectedFiles: readonly string[]
    readonly affectedSymbols: readonly ProjectedAffectedSymbol[]
    readonly omittedCounts?: { readonly tests: number; readonly ignored: number } | undefined
  }
}

/** Projected detail of public export binding or canonical impact with projectRelativePath. */
export interface ProjectedPublicImpactDetail {
  readonly target: string
  readonly directDependents: number
  readonly indirectDependents: number
  readonly transitiveDependents: number
  readonly riskLevel: RiskLevel
  readonly affectedFiles: readonly string[]
  readonly affectedSymbols: readonly ProjectedAffectedSymbol[]
  readonly affectedSpecs?: readonly string[] | undefined
  readonly affectedProcesses?: readonly string[] | undefined
  readonly omittedCounts?: { readonly tests: number; readonly ignored: number } | undefined
  /** Covering specs with projected evidence; present on the canonical view only. */
  readonly coveringSpecs?: readonly ProjectedCoveringSpecImpact[] | undefined
}

/** Resolved public export impact result with unified projectRelativePath. */
export interface ResolvedPublicExportImpactResult {
  readonly kind: 'export'
  readonly status: 'resolved'
  readonly export: string
  readonly from: string
  readonly surface: string
  readonly projectRelativeSurface: string
  readonly resolution: ProjectedSymbolResolutionResult
  readonly binding: ProjectedPublicBinding
  readonly target: LogicalSymbol
  readonly path: readonly ResolutionStep[]
  readonly bindingImpact: ProjectedPublicImpactDetail
  readonly canonicalImpact: ProjectedPublicImpactDetail
  /** Specs covering the canonical target and its dependents, with projected evidence. */
  readonly coveringSpecs: readonly ProjectedCoveringSpecImpact[]
  readonly riskLevel: RiskLevel
  readonly directDepsCount: number
  readonly indirectDepsCount: number
  readonly transitiveDepsCount: number
  readonly affectedFilesCount: number
  readonly omittedCounts: { readonly tests: number; readonly ignored: number }
}

/** Unresolved public export impact result. */
export interface UnresolvedPublicExportImpactResult {
  readonly kind: 'export'
  readonly status: 'not_found' | 'ambiguous' | 'unresolved'
  readonly export: string
  readonly from: string
  readonly surface: string
  readonly projectRelativeSurface: string
  readonly resolution: ProjectedSymbolResolutionResult
  readonly candidates?: readonly ProjectedResolutionCandidate[] | undefined
}

/** Result union returned by {@link runGraphImpact}. */
export type RunGraphImpactResult =
  | SingleFileImpactResult
  | MultiFileImpactResult
  | ResolvedSymbolImpactResult
  | SymbolNotFoundImpactResult
  | SymbolUnresolvedImpactResult
  | SymbolAmbiguousImpactResult
  | SpecImpactResult
  | ResolvedPublicExportImpactResult
  | UnresolvedPublicExportImpactResult

/**
 * Tells a workspace-qualified surface (`core:src/index.ts`) from a plain path.
 * A Windows drive letter (`C:\\repo\\src\\index.ts`) is a file path, not a workspace prefix.
 * @param surface - Raw `--from` or surface selector.
 * @returns True when the selector already carries a workspace prefix.
 */
function isWorkspaceQualifiedSurface(surface: string): boolean {
  return surface.includes(':') && !/^[A-Za-z]:[\\/]/.test(surface)
}

/**
 * Normalizes graph impact direction aliases to provider directions.
 * @param dir - Input direction alias
 * @returns Provider direction
 */
function normalizeDirection(
  dir: GraphImpactDirection | undefined,
): 'upstream' | 'downstream' | 'both' {
  if (dir === 'dependencies' || dir === 'downstream') return 'downstream'
  if (dir === 'both') return 'both'
  return 'upstream'
}

/**
 * Resolves a single file selector against the code graph provider.
 * @param provider - Code graph provider
 * @param raw - Raw file selector
 * @returns Canonical path and workspace
 */
async function resolveOneFile(
  provider: CodeGraphProvider,
  raw: string,
): Promise<{ path: string; workspace: string; projectRelativePath: string }> {
  const trimmed = raw.trim()
  if (trimmed.length === 0) {
    throw new GraphSelectorError('empty file selector')
  }

  const matches = (await provider.resolveFileSelector(trimmed)).filter(
    (candidate) => candidate.kind === 'file',
  )
  if (matches.length === 0) {
    throw new GraphSelectorError(`no indexed file matches "${trimmed}"`)
  }
  if (matches.length === 1) {
    return {
      path: matches[0]!.canonicalPath,
      workspace: matches[0]!.workspace,
      projectRelativePath: matches[0]!.projectRelativePath,
    }
  }
  throw new GraphSelectorError(
    `ambiguous selector "${trimmed}": matches ${String(matches.length)} files across workspaces`,
  )
}

/**
 * Projects one canonical source location without consulting the graph provider.
 * @param config - Active project configuration.
 * @param location - Canonical graph location.
 * @returns Location enriched with a repository-relative path.
 */
function projectSourceLocation(
  config: SpecdConfig,
  location: SourceLocation,
): ProjectedSourceLocation {
  return {
    ...location,
    projectRelativePath: toProjectRelativePath(config, location.filePath),
  }
}

/**
 * Projects one declaration occurrence and its nested location.
 * @param config - Active project configuration.
 * @param declaration - Physical declaration occurrence.
 * @returns Declaration with recursively projected location.
 */
function projectDeclaration(
  config: SpecdConfig,
  declaration: DeclarationOccurrence,
): ProjectedImpactDeclarationOccurrence {
  const location = projectSourceLocation(config, declaration.location)
  return { ...declaration, location, projectRelativePath: location.projectRelativePath }
}

/**
 * Projects both endpoints of physical dependency evidence.
 * @param config - Active project configuration.
 * @param evidence - Physical dependency evidence.
 * @returns Evidence with recursively projected endpoint locations.
 */
function projectPhysicalEvidence(
  config: SpecdConfig,
  evidence: PhysicalDependencyEvidence,
): ProjectedPhysicalDependencyEvidence {
  const sourceLocation =
    evidence.sourceLocation === undefined
      ? undefined
      : projectSourceLocation(config, evidence.sourceLocation)
  const targetLocation =
    evidence.targetLocation === undefined
      ? undefined
      : projectSourceLocation(config, evidence.targetLocation)
  return {
    ...evidence,
    sourceLocation,
    targetLocation,
    ...(sourceLocation === undefined
      ? {}
      : { sourceProjectRelativePath: sourceLocation.projectRelativePath }),
    ...(targetLocation === undefined
      ? {}
      : { targetProjectRelativePath: targetLocation.projectRelativePath }),
  }
}

/**
 * Recursively projects every declaration location nested in a resolved target.
 * @param config - Active project configuration.
 * @param target - Resolved target at its proven identity layer.
 * @returns Target with all nested declaration locations projected.
 */
function projectResolvedTarget(
  config: SpecdConfig,
  target: ResolvedSymbolTarget,
): ProjectedResolvedSymbolTarget {
  if (target.kind === 'declaration') {
    return { ...target, declaration: projectDeclaration(config, target.declaration) }
  }
  return {
    ...target,
    declarations: target.declarations.map((declaration) => projectDeclaration(config, declaration)),
  }
}

/**
 * Projects covering-spec file evidence to `projectRelativePath` without graph reads.
 * @param config - Active project configuration.
 * @param coveringSpecs - Covering specs with canonical evidence targets; a provider that omits them yields none.
 * @returns Covering specs whose file evidence exposes a project-relative path.
 */
function projectCoveringSpecs(
  config: SpecdConfig,
  coveringSpecs: readonly CoveringSpecImpact[] | undefined,
): ProjectedCoveringSpecImpact[] {
  return (coveringSpecs ?? []).map((spec) => ({
    ...spec,
    evidence: spec.evidence.map((evidence) =>
      evidence.kind === 'file'
        ? { ...evidence, projectRelativePath: toProjectRelativePath(config, evidence.target) }
        : evidence,
    ),
  }))
}

/**
 * Projects one resolution candidate's declarations.
 * @param config - Active project configuration.
 * @param candidate - Logical candidate with its declaration occurrences.
 * @returns Candidate with projected declaration locations.
 */
function projectResolutionCandidate(
  config: SpecdConfig,
  candidate: ResolutionCandidate,
): ProjectedResolutionCandidate {
  return {
    ...candidate,
    declarations: candidate.declarations.map((declaration) =>
      projectDeclaration(config, declaration),
    ),
  }
}

/**
 * Projects every nested location of a symbol resolution result.
 * @param config - Active project configuration.
 * @param resolution - Provider resolution result.
 * @returns Resolution with projected resolved target and candidates.
 */
function projectSymbolResolution(
  config: SpecdConfig,
  resolution: SymbolResolutionResult,
): ProjectedSymbolResolutionResult {
  return {
    ...resolution,
    resolvedTarget:
      resolution.resolvedTarget === null
        ? null
        : projectResolvedTarget(config, resolution.resolvedTarget),
    candidates: resolution.candidates.map((candidate) =>
      projectResolutionCandidate(config, candidate),
    ),
  }
}

/**
 * Runs file, symbol, or spec impact analysis and projects all paths to repository-relative `projectRelativePath`.
 *
 * @param ctx - SDK host context
 * @param input - Impact analysis parameters
 * @returns Unified impact analysis result
 */
export async function runGraphImpact(
  ctx: SdkHostContext,
  input: RunGraphImpactInput,
): Promise<RunGraphImpactResult> {
  const config = ctx.kernel.project.getConfig.execute()
  const direction = normalizeDirection(input.direction)
  const maxDepth = input.depth ?? 3

  const exportName = input.export
  const surface = input.from ?? input.surface
  if ((exportName !== undefined) !== (surface !== undefined)) {
    throw new GraphSelectorError(
      'export and from (or surface) must be specified together for public export impact analysis.',
    )
  }

  const executeWithProvider = async (
    provider: CodeGraphProvider,
  ): Promise<RunGraphImpactResult> => {
    // 1. Files impact
    if (input.files !== undefined && input.files.length > 0) {
      const resolved = await Promise.all(input.files.map((raw) => resolveOneFile(provider, raw)))

      if (resolved.length === 1) {
        const file = resolved[0]!
        const result =
          input.filter === undefined
            ? await provider.analyzeFileImpact(file.path, direction, maxDepth)
            : await provider.analyzeFileImpact(file.path, direction, maxDepth, input.filter)

        const affectedFiles = result.affectedFiles.map((p) => toProjectRelativePath(config, p))
        const affectedSymbols = result.affectedSymbols
          ? result.affectedSymbols.map((s) => ({
              ...s,
              filePath: toProjectRelativePath(config, s.filePath),
              projectRelativePath: toProjectRelativePath(config, s.filePath),
            }))
          : []

        return {
          kind: 'file',
          canonicalPath: file.path,
          projectRelativePath: file.projectRelativePath,
          workspace: file.workspace,
          riskLevel: result.riskLevel,
          directDepsCount: result.directDependents,
          indirectDepsCount: result.indirectDependents,
          transitiveDepsCount: result.transitiveDependents,
          affectedFilesCount: result.affectedFiles.length,
          directDependents: result.directDependents,
          indirectDependents: result.indirectDependents,
          transitiveDependents: result.transitiveDependents,
          affectedFiles,
          affectedSymbols,
          symbols: result.symbols,
          coveringSpecs: projectCoveringSpecs(config, result.coveringSpecs),
          omittedCounts: result.omittedCounts ?? { tests: 0, ignored: 0 },
        }
      }

      // Multi-file
      const filePaths = resolved.map((f) => f.path)
      const result =
        input.filter === undefined
          ? await provider.analyzeFilesImpact(filePaths, direction, maxDepth)
          : await provider.analyzeFilesImpact(filePaths, direction, maxDepth, input.filter)

      const individualResults = result.symbols as readonly FileImpactResult[]
      const perFile = resolved.map((f, i) => {
        const r = individualResults[i]!
        return {
          file: f.path,
          projectRelativePath: f.projectRelativePath,
          result: {
            riskLevel: r.riskLevel,
            directDependents: r.directDependents,
            indirectDependents: r.indirectDependents,
            transitiveDependents: r.transitiveDependents,
            affectedFiles: r.affectedFiles.map((p: string) => toProjectRelativePath(config, p)),
            symbols: r.symbols,
          },
        }
      })

      return {
        kind: 'files',
        targets: resolved.map((f) => f.path),
        projectRelativeTargets: resolved.map((f) => f.projectRelativePath),
        riskLevel: result.riskLevel,
        directDepsCount: result.directDependents,
        indirectDepsCount: result.indirectDependents,
        transitiveDepsCount: result.transitiveDependents,
        affectedFilesCount: result.affectedFiles.length,
        directDependents: result.directDependents,
        indirectDependents: result.indirectDependents,
        transitiveDependents: result.transitiveDependents,
        affectedFiles: result.affectedFiles.map((p) => toProjectRelativePath(config, p)),
        coveringSpecs: projectCoveringSpecs(config, result.coveringSpecs),
        omittedCounts: result.omittedCounts ?? { tests: 0, ignored: 0 },
        perFile,
      }
    }

    // 2. Symbol impact
    if (input.symbol !== undefined) {
      const resolved = await provider.resolveSymbolSelector(input.symbol)
      if (resolved.status === 'missing') {
        return {
          kind: 'symbol',
          status: 'not_found',
          symbol: input.symbol,
        }
      }
      if (resolved.status === 'unresolved') {
        // The graph could not prove absence; never report this as "not found".
        return {
          kind: 'symbol',
          status: 'unresolved',
          symbol: input.symbol,
          reasonCode: resolved.reasonCode,
        }
      }

      if (resolved.status === 'ambiguous') {
        const foundById = new Map(
          (await provider.getSymbolsByIds(resolved.candidates.map((c) => c.symbolId))).map((s) => [
            s.id,
            s,
          ]),
        )
        const candidates = resolved.candidates
          .map((candidate) => {
            const sym = foundById.get(candidate.symbolId)
            return sym === undefined
              ? null
              : {
                  symbol: sym,
                  projectRelativePath: sym.projectRelativePath,
                }
          })
          .filter((c): c is { symbol: SymbolNode; projectRelativePath: string } => c !== null)

        return {
          kind: 'symbol',
          status: 'ambiguous',
          symbol: input.symbol,
          totalCandidates: resolved.totalCandidates,
          candidates,
        }
      }

      // The selector layer always supplies the typed target; the SDK never rebuilds one.
      const resolvedTarget: ResolvedSymbolTarget = resolved.target

      const result: DomainResolvedSymbolImpactResult =
        input.filter !== undefined
          ? await provider.analyzeResolvedSymbolImpact(
              resolvedTarget,
              direction,
              maxDepth,
              input.filter,
            )
          : await provider.analyzeResolvedSymbolImpact(resolvedTarget, direction, maxDepth)

      const targetDeclarations: readonly DeclarationOccurrence[] =
        result.resolvedTarget.kind === 'declaration'
          ? [result.resolvedTarget.declaration]
          : result.resolvedTarget.declarations

      // Display-only summary derived after traversal; it never selects what was traversed.
      const first = targetDeclarations[0]
      if (first === undefined) {
        return {
          kind: 'symbol',
          status: 'not_found',
          symbol: input.symbol,
        }
      }
      const firstNode =
        result.resolvedTarget.kind === 'declaration' &&
        result.resolvedTarget.logicalSymbol === undefined
          ? await provider.getSymbol(first.symbolId)
          : undefined
      const sym: SymbolNode = {
        id: first.symbolId,
        name:
          result.resolvedTarget.kind === 'logical-target' ||
          result.resolvedTarget.kind === 'public-binding'
            ? result.resolvedTarget.logicalSymbol.name
            : (result.resolvedTarget.logicalSymbol?.name ?? firstNode?.name ?? first.symbolId),
        kind: first.kind,
        filePath: first.location.filePath,
        projectRelativePath: toProjectRelativePath(config, first.location.filePath),
        line: first.location.line,
        column: first.location.column,
        endLine: first.location.endLine ?? first.location.line,
        endColumn: first.location.endColumn ?? first.location.column,
        selectionRange: {
          startLine: first.location.line,
          startColumn: first.location.column,
          endLine: first.location.endLine ?? first.location.line,
          endColumn: first.location.endColumn ?? first.location.column,
        },
        parentId: undefined,
        comment: undefined,
      }

      const projectedDeclarations = targetDeclarations.map((declaration) =>
        projectDeclaration(config, declaration),
      )
      const projectedResolvedTarget = projectResolvedTarget(config, result.resolvedTarget)

      const projectedPhysicalEvidence: ProjectedPhysicalDependencyEvidence[] =
        result.physicalEvidence.map((evidence) => projectPhysicalEvidence(config, evidence))

      const projectedSemanticAffectedTargets: ProjectedSemanticAffectedTarget[] =
        result.semanticAffectedTargets.map((target) => {
          if (target.kind === 'logical-target') {
            return {
              kind: 'logical-target',
              logicalSymbol: target.logicalSymbol,
              depth: target.depth,
              declarations: target.declarations.map((declaration) =>
                projectDeclaration(config, declaration),
              ),
              evidence: target.evidence.map((evidence) =>
                projectPhysicalEvidence(config, evidence),
              ),
            }
          } else {
            return {
              kind: 'physical-only',
              declaration: {
                ...target.declaration,
                projectRelativePath: toProjectRelativePath(config, target.declaration.filePath),
              },
              projectRelativePath: toProjectRelativePath(config, target.declaration.filePath),
              depth: target.depth,
              evidence: target.evidence.map((evidence) =>
                projectPhysicalEvidence(config, evidence),
              ),
            }
          }
        })

      const projectRelativePath =
        projectedDeclarations[0]?.projectRelativePath ?? sym.projectRelativePath

      const displayResult = {
        target:
          result.resolvedTarget.kind === 'declaration'
            ? sym.id
            : result.resolvedTarget.logicalSymbol.id,
        riskLevel: result.riskLevel,
        directDependents: result.directDependents,
        indirectDependents: result.indirectDependents,
        transitiveDependents: result.transitiveDependents,
        affectedFiles: result.affectedFiles.map((p) => toProjectRelativePath(config, p)),
        affectedSymbols: result.affectedSymbols.map((s) => ({
          ...s,
          filePath: toProjectRelativePath(config, s.filePath),
          projectRelativePath: toProjectRelativePath(config, s.filePath),
        })),
        affectedSpecs: result.affectedSpecs,
        affectedProcesses: result.affectedProcesses,
        coveringSpecs: projectCoveringSpecs(config, result.coveringSpecs),
        omittedCounts: result.omittedCounts,
      }

      return {
        kind: 'symbol',
        status: 'resolved',
        targetKind: result.resolvedTarget.kind,
        resolvedTarget: projectedResolvedTarget,
        ...(result.resolvedTarget.kind === 'logical-target'
          ? { logicalSymbol: result.resolvedTarget.logicalSymbol }
          : result.resolvedTarget.kind === 'declaration' && result.resolvedTarget.logicalSymbol
            ? { logicalSymbol: result.resolvedTarget.logicalSymbol }
            : result.resolvedTarget.kind === 'public-binding'
              ? { logicalSymbol: result.resolvedTarget.logicalSymbol }
              : {}),
        declarations: projectedDeclarations,
        symbol: sym,
        projectRelativePath,
        riskLevel: result.riskLevel,
        directDepsCount: result.directDependents,
        indirectDepsCount: result.indirectDependents,
        transitiveDepsCount: result.transitiveDependents,
        affectedFilesCount: result.affectedFiles.length,
        omittedCounts: result.omittedCounts ?? { tests: 0, ignored: 0 },
        semanticCounts: result.semanticCounts,
        semanticAffectedTargets: projectedSemanticAffectedTargets,
        physicalEvidence: projectedPhysicalEvidence,
        coveringSpecs: projectCoveringSpecs(config, result.coveringSpecs),
        impact: displayResult,
      }
    }

    // 3. Spec impact
    if (input.spec !== undefined) {
      const spec = await provider.getSpec(input.spec)
      if (spec === undefined) {
        throw new GraphSpecNotFoundError(input.spec)
      }

      const result =
        input.filter === undefined
          ? await provider.analyzeSpecImpact(input.spec, direction, maxDepth)
          : await provider.analyzeSpecImpact(input.spec, direction, maxDepth, input.filter)

      const displayResult = {
        ...result,
        affectedFiles: result.affectedFiles.map((p) => toProjectRelativePath(config, p)),
        affectedSymbols: result.affectedSymbols.map((s) => ({
          ...s,
          filePath: toProjectRelativePath(config, s.filePath),
          projectRelativePath: toProjectRelativePath(config, s.filePath),
        })),
      }

      return {
        kind: 'spec',
        spec: spec.specId,
        riskLevel: result.riskLevel,
        directDepsCount: result.directDependents,
        indirectDepsCount: result.indirectDependents,
        transitiveDepsCount: result.transitiveDependents,
        affectedFilesCount: result.affectedFiles.length,
        omittedCounts: result.omittedCounts ?? { tests: 0, ignored: 0 },
        impact: displayResult,
      }
    }

    // 4. Public export impact
    if (exportName !== undefined && surface !== undefined) {
      let canonicalSurface = surface
      if (!isWorkspaceQualifiedSurface(surface)) {
        const matches = (await provider.resolveFileSelector(surface)).filter(
          (candidate) => candidate.kind === 'file',
        )
        if (matches.length > 1) {
          throw new GraphSelectorError(
            `ambiguous public surface "${surface}": ${matches.map((m) => m.canonicalPath).join(', ')}`,
          )
        }
        if (matches.length === 1) {
          canonicalSurface = matches[0]!.canonicalPath
        }
      }
      const workspace = splitWorkspaceIdentity(canonicalSurface)?.workspace ?? 'default'
      const resolution = await provider.resolveSymbolReference({
        workspace,
        requested: exportName,
        publicSurface: canonicalSurface,
      })

      const projectRelativeSurface = toProjectRelativePath(config, canonicalSurface)

      if (resolution.status !== 'resolved' || resolution.target === null) {
        return {
          kind: 'export',
          status:
            resolution.status === 'unresolved'
              ? 'unresolved'
              : resolution.status === 'ambiguous'
                ? 'ambiguous'
                : 'not_found',
          export: exportName,
          from: surface,
          surface,
          projectRelativeSurface,
          resolution: projectSymbolResolution(config, resolution),
          ...(resolution.status === 'ambiguous'
            ? {
                candidates: resolution.candidates.map((candidate) =>
                  projectResolutionCandidate(config, candidate),
                ),
              }
            : {}),
        }
      }

      const selected = await provider.getExactPublicBinding({
        surface: canonicalSurface,
        exportedName: exportName,
        space: resolution.target.space,
        targetId: resolution.target.id,
      })

      if (selected === null) {
        return {
          kind: 'export',
          status: 'ambiguous',
          export: exportName,
          from: surface,
          surface,
          projectRelativeSurface,
          resolution: {
            ...projectSymbolResolution(config, resolution),
            status: 'ambiguous',
            reasonCode: 'AMBIGUOUS_PUBLIC_BINDING',
          },
          candidates:
            resolution.candidates.length > 0
              ? resolution.candidates.map((candidate) =>
                  projectResolutionCandidate(config, candidate),
                )
              : resolution.resolvedTarget !== null &&
                  resolution.resolvedTarget.kind !== 'declaration'
                ? [
                    projectResolutionCandidate(config, {
                      target: resolution.target,
                      declarations: resolution.resolvedTarget.declarations,
                      path: resolution.path,
                    }),
                  ]
                : [],
        }
      }

      const impactInput = {
        binding: selected.binding,
        target: resolution.target,
        declarations: selected.declarations,
        path: resolution.path,
      }
      const result =
        input.filter === undefined
          ? await provider.analyzePublicBindingImpact(impactInput, direction, maxDepth)
          : await provider.analyzePublicBindingImpact(
              impactInput,
              direction,
              maxDepth,
              input.filter,
            )

      const mapImpactDetail = (impact: ImpactResult): ProjectedPublicImpactDetail => ({
        target: impact.target,
        directDependents: impact.directDependents,
        indirectDependents: impact.indirectDependents,
        transitiveDependents: impact.transitiveDependents,
        riskLevel: impact.riskLevel,
        affectedFiles: impact.affectedFiles.map((p) => toProjectRelativePath(config, p)),
        affectedSymbols: (impact.affectedSymbols ?? []).map((s) => ({
          ...s,
          filePath: toProjectRelativePath(config, s.filePath),
          projectRelativePath: toProjectRelativePath(config, s.filePath),
        })),
        ...(impact.affectedSpecs !== undefined ? { affectedSpecs: impact.affectedSpecs } : {}),
        ...(impact.affectedProcesses !== undefined
          ? { affectedProcesses: impact.affectedProcesses }
          : {}),
        ...(impact.omittedCounts !== undefined ? { omittedCounts: impact.omittedCounts } : {}),
      })

      const bindingImpact = mapImpactDetail(result.bindingImpact)
      // Only the canonical view carries covering-spec evidence; the exact route has none.
      const coveringSpecs = projectCoveringSpecs(config, result.canonicalImpact.coveringSpecs)
      const canonicalImpact: ProjectedPublicImpactDetail = {
        ...mapImpactDetail(result.canonicalImpact),
        coveringSpecs,
      }

      return {
        kind: 'export',
        status: 'resolved',
        export: exportName,
        from: surface,
        surface,
        projectRelativeSurface,
        resolution: projectSymbolResolution(config, resolution),
        binding: {
          ...result.binding,
          projectRelativeSurface: toProjectRelativePath(config, result.binding.surface),
        },
        target: result.target,
        path: result.path,
        bindingImpact,
        canonicalImpact,
        coveringSpecs,
        riskLevel: canonicalImpact.riskLevel,
        directDepsCount: canonicalImpact.directDependents,
        indirectDepsCount: canonicalImpact.indirectDependents,
        transitiveDepsCount: canonicalImpact.transitiveDependents,
        affectedFilesCount: canonicalImpact.affectedFiles.length,
        omittedCounts: canonicalImpact.omittedCounts ??
          bindingImpact.omittedCounts ?? { tests: 0, ignored: 0 },
      }
    }

    throw new GraphSelectorError(
      'Either files, symbol, spec, or export with from must be specified for impact analysis.',
    )
  }

  if (input.provider !== undefined) {
    return executeWithProvider(input.provider)
  }

  return withOpenGraphProvider(ctx, executeWithProvider)
}

export type {
  ResolvedSymbolTarget,
  SemanticImpactCounts,
  DeclarationOccurrence,
  PhysicalDependencyEvidence,
}
