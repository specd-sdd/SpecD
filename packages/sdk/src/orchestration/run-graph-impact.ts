import {
  type CodeGraphProvider,
  type CoveringSpecImpact,
  type FileImpactResult,
  type ImpactResult,
  type ImpactResultFilter,
  type LogicalSymbol,
  type PublicBinding,
  type ResolutionStep,
  type RiskLevel,
  SpecNotFoundError as GraphSpecNotFoundError,
  type SymbolNode,
  type SymbolResolutionResult,
} from '@specd/code-graph'
import { SpecdError } from '@specd/core'
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
  readonly coveringSpecs: readonly CoveringSpecImpact[]
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
  readonly coveringSpecs: readonly CoveringSpecImpact[]
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

/** Resolved symbol impact result with unified projectRelativePath. */
export interface ResolvedSymbolImpactResult {
  readonly kind: 'symbol'
  readonly status: 'resolved'
  readonly symbol: SymbolNode
  readonly projectRelativePath: string
  readonly riskLevel: RiskLevel
  readonly directDepsCount: number
  readonly indirectDepsCount: number
  readonly transitiveDepsCount: number
  readonly affectedFilesCount: number
  readonly omittedCounts: { readonly tests: number; readonly ignored: number }
  readonly impact: {
    readonly target: string
    readonly riskLevel: RiskLevel
    readonly directDependents: number
    readonly indirectDependents: number
    readonly transitiveDependents: number
    readonly affectedFiles: readonly string[]
    readonly affectedSymbols: readonly ProjectedAffectedSymbol[]
    readonly coveringSpecs?: readonly CoveringSpecImpact[] | undefined
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
}

/** Resolved public export impact result with unified projectRelativePath. */
export interface ResolvedPublicExportImpactResult {
  readonly kind: 'export'
  readonly status: 'resolved'
  readonly export: string
  readonly from: string
  readonly surface: string
  readonly projectRelativeSurface: string
  readonly resolution: SymbolResolutionResult
  readonly binding: PublicBinding
  readonly target: LogicalSymbol
  readonly path: readonly ResolutionStep[]
  readonly bindingImpact: ProjectedPublicImpactDetail
  readonly canonicalImpact: ProjectedPublicImpactDetail
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
  readonly resolution: SymbolResolutionResult
  readonly candidates?: readonly never[] | undefined
}

/** Result union returned by {@link runGraphImpact}. */
export type RunGraphImpactResult =
  | SingleFileImpactResult
  | MultiFileImpactResult
  | ResolvedSymbolImpactResult
  | SymbolNotFoundImpactResult
  | SymbolAmbiguousImpactResult
  | SpecImpactResult
  | ResolvedPublicExportImpactResult
  | UnresolvedPublicExportImpactResult

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
          coveringSpecs: result.coveringSpecs,
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
        coveringSpecs: result.coveringSpecs,
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

      const sym = await provider.getSymbol(resolved.match.symbolId)
      if (sym === undefined) {
        return {
          kind: 'symbol',
          status: 'not_found',
          symbol: input.symbol,
        }
      }

      const result =
        input.filter === undefined
          ? await provider.analyzeImpact(sym.id, direction, maxDepth)
          : await provider.analyzeImpact(sym.id, direction, maxDepth, input.filter)

      const projectRelativePath = sym.projectRelativePath
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
        kind: 'symbol',
        status: 'resolved',
        symbol: sym,
        projectRelativePath,
        riskLevel: result.riskLevel,
        directDepsCount: result.directDependents,
        indirectDepsCount: result.indirectDependents,
        transitiveDepsCount: result.transitiveDependents,
        affectedFilesCount: result.affectedFiles.length,
        omittedCounts: result.omittedCounts ?? { tests: 0, ignored: 0 },
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
      if (!surface.includes(':')) {
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
          status: 'not_found',
          export: exportName,
          from: surface,
          surface,
          projectRelativeSurface,
          resolution,
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
            ...resolution,
            status: 'ambiguous',
            reasonCode: 'AMBIGUOUS_PUBLIC_BINDING',
          },
          candidates: [],
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
      const canonicalImpact = mapImpactDetail(result.canonicalImpact)

      return {
        kind: 'export',
        status: 'resolved',
        export: exportName,
        from: surface,
        surface,
        projectRelativeSurface,
        resolution,
        binding: result.binding,
        target: result.target,
        path: result.path,
        bindingImpact,
        canonicalImpact,
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
