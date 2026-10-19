import {
  type LocalBindingLookup,
  type LogicalDeclaration,
  type LogicalSymbolLookup,
  type PublicBindingLookup,
  type GraphStore,
} from '../../domain/ports/graph-store.js'
import { splitWorkspaceIdentity } from '../../domain/services/split-workspace-identity.js'
import { isExactLaneQuery, qualifiedLookupText } from '../../domain/services/exact-lane-query.js'
import { parseDottedMemberReference } from '../../domain/services/parse-member-reference.js'
import { type AdapterRegistryPort } from '../../domain/ports/adapter-registry-port.js'
import { IndexCoverageStatus } from '../../domain/value-objects/index-session.js'
import {
  FreshnessState,
  IndexedResourceKind,
  type IndexedResourceFreshnessResult,
  type IndexedResourceKey,
} from '../../domain/value-objects/indexed-input-freshness.js'
import { type SymbolNode } from '../../domain/value-objects/symbol-node.js'
import {
  parseLogicalSymbol,
  deriveQualifiedName,
  DeclarationOccurrenceForm,
  type DeclarationOccurrence,
  type DeclarationResolutionTarget,
  type LogicalSymbol,
  type MemberSemantics,
  type PublicBinding,
  type ResolutionCandidate,
  type ResolutionHealth,
  type ResolutionStep,
  type ResolveSymbolReferenceInput,
  type ResolvedSymbolTarget,
  type SymbolResolutionResult,
} from '../../domain/value-objects/symbol-reference.js'

const MAX_PATH_DEPTH = 32

/** Resolves structured symbol references using backend-neutral indexed facts. */
export class ResolveSymbolReference {
  /**
   * Creates a resolver.
   * @param store - Open graph store containing reference facts.
   * @param getHealth - Returns one current graph-health snapshot per batch.
   * @param assessResources - Optionally proves freshness for exact addressed resources.
   * @param registry - Shared adapter registry used to parse anchored member text.
   */
  constructor(
    private readonly store: GraphStore,
    private readonly getHealth: () => Promise<ResolutionHealth>,
    private readonly assessResources?: (
      resources: readonly IndexedResourceKey[],
    ) => Promise<readonly IndexedResourceFreshnessResult[]>,
    private readonly registry?: AdapterRegistryPort,
  ) {}

  /**
   * Resolves one request.
   * @param input - Structured reference request.
   * @returns Resolution outcome with evidence and health.
   */
  async execute(input: ResolveSymbolReferenceInput): Promise<SymbolResolutionResult> {
    const [result] = await this.executeBatch([input])
    return result!
  }

  /**
   * Resolves a batch with one health read and shared indexed queries.
   * @param inputs - Structured reference requests.
   * @returns Ordered resolution outcomes corresponding to the requests.
   */
  async executeBatch(
    inputs: readonly ResolveSymbolReferenceInput[],
  ): Promise<readonly SymbolResolutionResult[]> {
    if (inputs.length === 0) return []

    const health = await this.getHealth()

    const validated = inputs.map((input) => ({
      input,
      error: validateRequest(input),
    }))

    const exactInputs: Array<{ index: number; input: ResolveSymbolReferenceInput }> = []
    const semanticInputs: Array<{ index: number; input: ResolveSymbolReferenceInput }> = []

    validated.forEach(({ input, error }, index) => {
      if (error !== null) return
      if (isExactDeclarationRequest(input)) {
        exactInputs.push({ index, input })
      } else {
        semanticInputs.push({ index, input: normalizeRequest(input) })
      }
    })

    const exactDeclarationSymbolIds = [
      ...new Set(
        exactInputs
          .map(({ input }) => input.declarationSymbolId)
          .filter((id): id is string => id !== undefined),
      ),
    ]
    const positionFilePaths = [
      ...new Set(
        exactInputs
          .map(({ input }) => (input.position ? input.filePath : undefined))
          .filter((fp): fp is string => fp !== undefined),
      ),
    ]

    const requests = semanticInputs.map(({ input }) => input)
    const logicalLookups = deduplicateLogicalLookups(requests.flatMap(expandedLookups))
    const qualifiedNames = [
      ...new Set(
        requests.flatMap((input) => {
          const spelling = qualifiedLookupText(input.requested)
          return spelling === undefined ? [] : [spelling]
        }),
      ),
    ]
    const publicLookups = requests
      .filter((input) => input.publicSurface !== undefined)
      .map(toPublicLookup)
    const localLookups = requests.filter((input) => input.filePath !== undefined).map(toLocalLookup)

    const [
      exactSymbolsById,
      positionSymbols,
      logicalSymbols,
      publicBindings,
      localBindings,
      qualifiedTargets,
    ] = await Promise.all([
      exactDeclarationSymbolIds.length === 0
        ? []
        : this.store.getSymbolsByIds(exactDeclarationSymbolIds),
      positionFilePaths.length === 0
        ? []
        : this.store.findSymbols({ filePaths: positionFilePaths }),
      this.store.findLogicalSymbols(logicalLookups),
      publicLookups.length === 0 ? [] : this.store.findPublicBindings(publicLookups),
      localLookups.length === 0 ? [] : this.store.findLocalBindings(localLookups),
      qualifiedNames.length === 0
        ? []
        : this.store.findLogicalSymbolsByQualifiedNames(qualifiedNames),
    ])

    const exactMatchesByRequestIndex = new Map<number, SymbolNode[]>()
    for (const { index, input } of exactInputs) {
      if (input.declarationSymbolId !== undefined) {
        const found = exactSymbolsById.find((s) => s.id === input.declarationSymbolId)
        exactMatchesByRequestIndex.set(
          index,
          found && (input.kind === undefined || found.kind === input.kind) ? [found] : [],
        )
      } else if (input.position !== undefined && input.filePath !== undefined) {
        const matches = positionSymbols.filter(
          (s) =>
            s.filePath === input.filePath &&
            s.line === input.position!.line &&
            s.column === input.position!.column &&
            (input.kind === undefined || s.kind === input.kind),
        )
        exactMatchesByRequestIndex.set(index, matches)
      }
    }

    const uniquelyMatchedSymbols = [...exactMatchesByRequestIndex.values()]
      .filter((matches) => matches.length === 1)
      .map((matches) => matches[0]!)
    const uniqueExactSymbolIds = [...new Set(uniquelyMatchedSymbols.map((s) => s.id))]

    const mappedExactDeclarations =
      uniqueExactSymbolIds.length === 0
        ? []
        : await this.store.findLogicalDeclarationsByDeclarationIds(uniqueExactSymbolIds)
    const mappedExactDeclBySymbolId = new Map(
      mappedExactDeclarations.map((d) => [d.declaration.symbolId, d]),
    )

    const exactLogicalSymbolIds = [
      ...new Set(mappedExactDeclarations.map((d) => d.logicalSymbolId)),
    ]
    const exactLogicalSymbols =
      exactLogicalSymbolIds.length === 0
        ? []
        : await this.store.findLogicalSymbolsByIds(exactLogicalSymbolIds)
    const exactLogicalSymbolById = new Map(exactLogicalSymbols.map((s) => [s.id, s]))

    const pathSources = [
      ...publicBindings.map((binding) => binding.id),
      ...localBindings.map((binding) => binding.id),
      ...requests.flatMap((input) => (input.ownerId ? [input.ownerId] : [])),
    ]
    const steps = await loadResolutionSteps(this.store, pathSources)

    const targetIds = new Set<string>(steps.map((step) => step.toId))
    for (const binding of [...publicBindings, ...localBindings]) {
      if (binding.targetId !== undefined) targetIds.add(binding.targetId)
    }
    for (const input of requests) {
      if (input.ownerId !== undefined) targetIds.add(input.ownerId)
    }
    const hierarchyLookups = deduplicateLogicalLookups(
      requests.flatMap((request) => {
        if (request.ownerId === undefined) return []
        return [...tracePaths(request.ownerId, steps).keys()].map(
          (ownerId): LogicalSymbolLookup => ({
            workspace: request.workspace,
            surface: undefined,
            name: request.requested,
            space: request.symbolSpace,
            ownerId,
            ...memberLookupAxes(request.memberSemantics),
          }),
        )
      }),
    )
    const [boundTargets, hierarchyTargets] = await Promise.all([
      targetIds.size === 0 ? [] : this.store.findLogicalSymbolsByIds([...targetIds]),
      hierarchyLookups.length === 0 ? [] : this.store.findLogicalSymbols(hierarchyLookups),
    ])
    const allTargets = deduplicateTargets([
      ...logicalSymbols,
      ...boundTargets,
      ...hierarchyTargets,
      ...qualifiedTargets,
    ])
    const declarations = await this.store.findDeclarations(allTargets.map((target) => target.id))
    const declarationMap = groupDeclarations(declarations)
    const resourceFiles = [
      ...requests.flatMap((request) => {
        const addressedResource = request.filePath ?? request.publicSurface
        return addressedResource === undefined ? [] : [addressedResource]
      }),
      ...declarations.map((declaration) => declaration.declaration.location.filePath),
      ...exactInputs.flatMap(({ input }) => (input.filePath !== undefined ? [input.filePath] : [])),
      ...uniquelyMatchedSymbols.map((s) => s.filePath),
    ]
    const allRequestsForResources = [...requests, ...exactInputs.map(({ input }) => input)]
    const resources = deduplicateFileResources(resourceFiles, allRequestsForResources)
    const [coverage, resourceFreshness] = await Promise.all([
      this.store.findIndexCoverage([...new Set(resourceFiles)].sort()),
      this.assessResources === undefined || resources.length === 0
        ? []
        : this.assessResources(resources),
    ])
    const freshnessMap = new Map(
      resourceFreshness.map((result) => [resourceKey(result.workspace, result.resourceId), result]),
    )

    const results = new Array<SymbolResolutionResult>(inputs.length)

    validated.forEach(({ input, error }, index) => {
      if (error !== null) {
        results[index] = {
          request: input,
          status: 'unresolved',
          reasonCode: error,
          health,
          resolvedTarget: null,
          target: null,
          candidates: [],
          path: [],
        }
      }
    })

    for (const { index, input } of exactInputs) {
      const matches = exactMatchesByRequestIndex.get(index) ?? []
      if (matches.length === 0) {
        const addressedResource = input.filePath
        const targetedFreshness =
          addressedResource !== undefined
            ? freshnessMap.get(resourceKey(input.workspace, addressedResource))
            : undefined
        const targetedCurrent = targetedFreshness?.state === FreshnessState.Current
        const targetedReason = targetedFreshness?.reasons[0]
        const graphReason =
          targetedFreshness !== undefined && !targetedCurrent
            ? (targetedReason ?? 'RESOURCE_FRESHNESS_UNKNOWN')
            : !targetedCurrent && health.fresh !== true
              ? (health.reasonCodes[0] ?? 'GRAPH_FRESHNESS_UNKNOWN')
              : health.complete !== true
                ? (health.reasonCodes[0] ?? 'GRAPH_COVERAGE_INCOMPLETE')
                : null
        if (graphReason !== null) {
          results[index] = {
            request: input,
            status: 'unresolved',
            reasonCode: graphReason,
            health,
            resolvedTarget: null,
            target: null,
            candidates: [],
            path: [],
          }
        } else {
          results[index] = {
            request: input,
            status: 'missing',
            reasonCode: 'DECLARATION_NOT_FOUND',
            health,
            resolvedTarget: null,
            target: null,
            candidates: [],
            path: [],
          }
        }
      } else if (matches.length > 1) {
        results[index] = {
          request: input,
          status: 'ambiguous',
          reasonCode: 'AMBIGUOUS_DECLARATION',
          health,
          resolvedTarget: null,
          target: null,
          candidates: [],
          path: [],
        }
      } else {
        const symbolNode = matches[0]!
        if (this.assessResources !== undefined) {
          const workspace = workspaceFromFilePath(symbolNode.filePath, input.workspace)
          const freshness = freshnessMap.get(resourceKey(workspace, symbolNode.filePath))
          if (freshness === undefined) {
            results[index] = {
              request: input,
              status: 'unresolved',
              reasonCode: 'RESOURCE_FRESHNESS_UNKNOWN',
              health,
              resolvedTarget: null,
              target: null,
              candidates: [],
              path: [],
            }
            continue
          }
          if (freshness.state !== FreshnessState.Current) {
            results[index] = {
              request: input,
              status: 'unresolved',
              reasonCode: freshness.reasons[0] ?? 'RESOURCE_FRESHNESS_UNKNOWN',
              health,
              resolvedTarget: null,
              target: null,
              candidates: [],
              path: [],
            }
            continue
          }
          const fileCoverage = coverage.find((entry) => entry.filePath === symbolNode.filePath)
          if (fileCoverage === undefined) {
            results[index] = {
              request: input,
              status: 'unresolved',
              reasonCode: 'COVERAGE_UNKNOWN',
              health,
              resolvedTarget: null,
              target: null,
              candidates: [],
              path: [],
            }
            continue
          }
          if (fileCoverage.status !== IndexCoverageStatus.Indexed) {
            results[index] = {
              request: input,
              status: 'unresolved',
              reasonCode:
                fileCoverage.reason ??
                `COVERAGE_${fileCoverage.status.replace('-', '_').toUpperCase()}`,
              health,
              resolvedTarget: null,
              target: null,
              candidates: [],
              path: [],
            }
            continue
          }
        }

        const mapped = mappedExactDeclBySymbolId.get(symbolNode.id)
        const logicalSymbol = mapped
          ? exactLogicalSymbolById.get(mapped.logicalSymbolId)
          : undefined
        const declaration: DeclarationOccurrence = mapped
          ? mapped.declaration
          : {
              logicalId: undefined,
              symbolId: symbolNode.id,
              location: {
                filePath: symbolNode.filePath,
                line: symbolNode.line,
                column: symbolNode.column,
                endLine: symbolNode.endLine,
                endColumn: symbolNode.endColumn,
              },
              kind: symbolNode.kind,
              form: DeclarationOccurrenceForm.Declaration,
            }
        const resolvedTarget: DeclarationResolutionTarget = {
          kind: 'declaration',
          declaration,
          logicalSymbol,
          path: [],
        }
        results[index] = {
          request: input,
          status: 'resolved',
          reasonCode: null,
          health,
          resolvedTarget,
          target: logicalSymbol ?? null,
          candidates: logicalSymbol
            ? [{ target: logicalSymbol, declarations: [declaration], path: [] }]
            : [],
          path: [],
        }
      }
    }

    for (const { index, input } of semanticInputs) {
      results[index] = resolvePrepared(this.registry, {
        request: input,
        health,
        logicalSymbols,
        publicBindings,
        localBindings,
        allTargets,
        declarationMap,
        steps,
        coverage,
        targetedFreshness: (() => {
          const addressedResource = input.filePath ?? input.publicSurface
          return addressedResource === undefined
            ? undefined
            : freshnessMap.get(resourceKey(input.workspace, addressedResource))
        })(),
        resourceFreshness: freshnessMap,
        freshnessAssessmentEnabled: this.assessResources !== undefined,
      })
    }

    return results
  }
}

/** Facts shared while resolving one normalized request. */
interface PreparedResolution {
  readonly request: ResolveSymbolReferenceInput
  readonly health: ResolutionHealth
  readonly logicalSymbols: readonly LogicalSymbol[]
  readonly publicBindings: Awaited<ReturnType<GraphStore['findPublicBindings']>>
  readonly localBindings: Awaited<ReturnType<GraphStore['findLocalBindings']>>
  readonly allTargets: readonly LogicalSymbol[]
  readonly declarationMap: ReadonlyMap<string, readonly DeclarationOccurrence[]>
  readonly steps: readonly ResolutionStep[]
  readonly coverage: Awaited<ReturnType<GraphStore['findIndexCoverage']>>
  readonly targetedFreshness: IndexedResourceFreshnessResult | undefined
  readonly resourceFreshness: ReadonlyMap<string, IndexedResourceFreshnessResult>
  readonly freshnessAssessmentEnabled: boolean
}

/**
 * Resolves a request from the prepared batch facts.
 * @param registry - Shared adapter registry used to parse anchored member text.
 * @param prepared - Prepared request and indexed facts.
 * @returns Conservative resolution outcome.
 */
function resolvePrepared(
  registry: AdapterRegistryPort | undefined,
  prepared: PreparedResolution,
): SymbolResolutionResult {
  const qualified = resolveQualifiedMember(registry, prepared)
  if (qualified !== undefined) return qualified
  const { request } = prepared
  const exact = prepared.logicalSymbols.filter(
    (target) =>
      (request.filePath !== undefined ||
        request.ownerId !== undefined ||
        request.logicalId !== undefined) &&
      matchesRequest(target, request) &&
      (request.logicalId === undefined || target.id === request.logicalId) &&
      hasMatchingDeclaration(prepared.declarationMap.get(target.id) ?? [], request),
  )
  if (exact.length > 0) {
    return outcomeFromTargets(prepared, exact, [])
  }

  const publicBindings = prepared.publicBindings.filter(
    (binding) =>
      binding.surface === request.publicSurface &&
      binding.exportedName === request.requested &&
      (request.symbolSpace === undefined || binding.space === request.symbolSpace),
  )
  const publicCandidates = candidatesFromBindingTargets(prepared, publicBindings)
  if (publicCandidates.length > 0) {
    const publicBinding = publicBindings.length === 1 ? publicBindings[0] : undefined
    return outcomeFromCandidates(prepared, publicCandidates, publicBinding)
  }

  const localBindings = prepared.localBindings.filter(
    (binding) =>
      binding.filePath === request.filePath &&
      binding.localName === request.requested &&
      (request.scopeId === undefined || binding.scopeId === request.scopeId) &&
      (request.symbolSpace === undefined || binding.space === request.symbolSpace),
  )
  const localCandidates = candidatesFromBindingTargets(prepared, localBindings)
  if (localCandidates.length > 0) {
    return outcomeFromCandidates(prepared, localCandidates)
  }

  const hierarchyCandidates = hierarchyCandidatesForRequest(prepared)
  if (hierarchyCandidates.length > 0) {
    return outcomeFromCandidates(prepared, hierarchyCandidates)
  }

  return absenceOutcome(prepared)
}

/**
 * Converts target matches into a resolution outcome.
 * @param prepared - Prepared request and indexed facts.
 * @param targets - Matched logical targets.
 * @param path - Provenance path leading to the targets.
 * @returns Resolution outcome.
 */
function outcomeFromTargets(
  prepared: PreparedResolution,
  targets: readonly LogicalSymbol[],
  path: readonly ResolutionStep[],
): SymbolResolutionResult {
  const candidates = targets
    .map((target) => candidateFor(prepared, target, path))
    .sort(compareCandidates)
  return outcomeFromCandidates(prepared, candidates)
}

/**
 * Selects a resolved or ambiguous outcome from candidates.
 * @param prepared - Prepared request and indexed facts.
 * @param candidates - Candidate targets with evidence.
 * @param publicBinding - Optional public binding that led to the candidates.
 * @returns Resolution outcome.
 */
function outcomeFromCandidates(
  prepared: PreparedResolution,
  candidates: readonly ResolutionCandidate[],
  publicBinding?: PublicBinding,
): SymbolResolutionResult {
  const unique = deduplicateCandidates(candidates)
  const evidenceIssue = candidateEvidenceIssue(prepared, unique)
  if (evidenceIssue !== null) return unresolved(prepared, evidenceIssue)
  if (unique.length === 1) {
    const candidate = unique[0]!
    const resolvedTarget: ResolvedSymbolTarget =
      publicBinding !== undefined
        ? {
            kind: 'public-binding',
            binding: publicBinding,
            logicalSymbol: candidate.target,
            declarations: candidate.declarations,
            path: candidate.path,
          }
        : {
            kind: 'logical-target',
            logicalSymbol: candidate.target,
            declarations: candidate.declarations,
            path: candidate.path,
          }
    return {
      request: prepared.request,
      status: 'resolved',
      reasonCode: null,
      health: prepared.health,
      resolvedTarget,
      target: candidate.target,
      candidates: unique,
      path: candidate.path,
    }
  }
  return {
    request: prepared.request,
    status: 'ambiguous',
    reasonCode: 'AMBIGUOUS_LOGICAL_TARGET',
    health: prepared.health,
    resolvedTarget: null,
    target: null,
    candidates: unique,
    path: [],
  }
}

/**
 * Returns the first deterministic freshness or coverage issue affecting candidate declarations.
 * @param prepared - Shared batch facts and freshness evidence.
 * @param candidates - Candidate targets about to be selected.
 * @returns Stable reason code, or null when every contributing declaration is current and covered.
 */
function candidateEvidenceIssue(
  prepared: PreparedResolution,
  candidates: readonly ResolutionCandidate[],
): string | null {
  const files = [
    ...new Set(
      candidates.flatMap((candidate) =>
        candidate.declarations.map((entry) => entry.location.filePath),
      ),
    ),
  ].sort()
  if (
    prepared.request.buildContext !== undefined &&
    files.some(
      (filePath) =>
        !prepared.coverage
          .find((entry) => entry.filePath === filePath)
          ?.capabilities.includes('buildContext'),
    )
  ) {
    return 'BUILD_CONTEXT_UNSUPPORTED'
  }
  if (!prepared.freshnessAssessmentEnabled) return null
  for (const filePath of files) {
    const workspace = workspaceFromFilePath(filePath, prepared.request.workspace)
    const freshness = prepared.resourceFreshness.get(resourceKey(workspace, filePath))
    if (freshness === undefined) return 'RESOURCE_FRESHNESS_UNKNOWN'
    if (freshness.state !== FreshnessState.Current) {
      return freshness.reasons[0] ?? 'RESOURCE_FRESHNESS_UNKNOWN'
    }
    const coverage = prepared.coverage.find((entry) => entry.filePath === filePath)
    if (coverage === undefined) return 'COVERAGE_UNKNOWN'
    if (coverage.status !== IndexCoverageStatus.Indexed) {
      return coverage.reason ?? `COVERAGE_${coverage.status.replace('-', '_').toUpperCase()}`
    }
  }
  return null
}

/**
 * Builds the exact file-resource union for addressed and candidate declaration files.
 * @param filePaths - Addressed and declaration file identities.
 * @param requests - Normalized requests supplying workspace fallbacks.
 * @returns Deduplicated deterministic file resources.
 */
function deduplicateFileResources(
  filePaths: readonly string[],
  requests: readonly ResolveSymbolReferenceInput[],
): IndexedResourceKey[] {
  const requestWorkspaceByFile = new Map(
    requests.flatMap((request) =>
      request.filePath === undefined && request.publicSurface === undefined
        ? []
        : [[request.filePath ?? request.publicSurface!, request.workspace] as const],
    ),
  )
  return [...new Set(filePaths)].sort().map((filePath) => ({
    workspace: workspaceFromFilePath(filePath, requestWorkspaceByFile.get(filePath) ?? ''),
    resourceKind: IndexedResourceKind.File,
    resourceId: filePath,
  }))
}

/**
 * Resolves the workspace identity encoded in a canonical graph file path.
 * @param filePath - Canonical or unprefixed file path.
 * @param fallback - Workspace to use for an unprefixed path.
 * @returns Encoded workspace or the supplied fallback.
 */
function workspaceFromFilePath(filePath: string, fallback: string): string {
  return splitWorkspaceIdentity(filePath)?.workspace ?? fallback
}

/**
 * Produces an unambiguous freshness-map key.
 * @param workspace - Workspace identity.
 * @param resourceId - Logical resource identity.
 * @returns Stable compound map key.
 */
function resourceKey(workspace: string, resourceId: string): string {
  return JSON.stringify([workspace, resourceId])
}

/**
 * Classifies a request for which no reference evidence was found.
 * @param prepared - Prepared request and indexed facts.
 * @returns Missing or unresolved outcome.
 */
function absenceOutcome(prepared: PreparedResolution): SymbolResolutionResult {
  const targetedCurrent = prepared.targetedFreshness?.state === FreshnessState.Current
  const targetedReason = prepared.targetedFreshness?.reasons[0]
  const addressed = prepared.request.filePath ?? prepared.request.publicSurface
  const addressedCoverage =
    addressed === undefined
      ? undefined
      : prepared.coverage.find((entry) => entry.filePath === addressed)
  // Coverage gaps elsewhere in the graph do not weaken absence in a resource that is
  // itself current and fully indexed.
  const addressedProven = addressedCoverage?.status === IndexCoverageStatus.Indexed
  const graphReason =
    prepared.targetedFreshness !== undefined && !targetedCurrent
      ? (targetedReason ?? 'RESOURCE_FRESHNESS_UNKNOWN')
      : !targetedCurrent && prepared.health.fresh !== true
        ? (prepared.health.reasonCodes[0] ?? 'GRAPH_FRESHNESS_UNKNOWN')
        : !addressedProven && prepared.health.complete !== true
          ? (prepared.health.reasonCodes[0] ?? 'GRAPH_COVERAGE_INCOMPLETE')
          : null
  if (graphReason !== null) return unresolved(prepared, graphReason)

  if (prepared.request.logicalId !== undefined) {
    return {
      request: prepared.request,
      status: 'missing',
      reasonCode: 'LOGICAL_TARGET_NOT_FOUND',
      health: prepared.health,
      resolvedTarget: null,
      target: null,
      candidates: [],
      path: [],
    }
  }

  const addressedResource = prepared.request.filePath ?? prepared.request.publicSurface
  if (addressedResource === undefined) {
    return unresolved(prepared, 'REFERENCE_UNPROVEN')
  }
  const coverage = prepared.coverage.find((entry) => entry.filePath === addressedResource)
  if (coverage === undefined) return unresolved(prepared, 'COVERAGE_UNKNOWN')
  if (coverage.status !== IndexCoverageStatus.Indexed) {
    return unresolved(
      prepared,
      coverage.reason ?? `COVERAGE_${coverage.status.replace('-', '_').toUpperCase()}`,
    )
  }
  if (
    prepared.request.buildContext !== undefined &&
    !coverage.capabilities.includes('buildContext')
  ) {
    return unresolved(prepared, 'BUILD_CONTEXT_UNSUPPORTED')
  }
  return {
    request: prepared.request,
    status: 'missing',
    reasonCode: 'REFERENCE_ABSENT',
    health: prepared.health,
    resolvedTarget: null,
    target: null,
    candidates: [],
    path: [],
  }
}

/**
 * Creates an unresolved outcome.
 * @param prepared - Prepared request and indexed facts.
 * @param reasonCode - Stable explanation for the unresolved state.
 * @returns Unresolved resolution outcome.
 */
function unresolved(prepared: PreparedResolution, reasonCode: string): SymbolResolutionResult {
  return {
    request: prepared.request,
    status: 'unresolved',
    reasonCode,
    health: prepared.health,
    resolvedTarget: null,
    target: null,
    candidates: [],
    path: [],
  }
}

/**
 * Resolves binding targets into candidates.
 * @param prepared - Prepared request and indexed facts.
 * @param bindings - Bindings that may point at logical targets.
 * @returns Deterministically ordered candidates.
 */
function candidatesFromBindingTargets(
  prepared: PreparedResolution,
  bindings: readonly { readonly id: string; readonly targetId: string | undefined }[],
): ResolutionCandidate[] {
  const candidates: ResolutionCandidate[] = []
  for (const binding of bindings) {
    if (binding.targetId === undefined) continue
    const target = prepared.allTargets.find((entry) => entry.id === binding.targetId)
    if (target === undefined) continue
    candidates.push(candidateFor(prepared, target, tracePath(binding.id, prepared.steps)))
  }
  return candidates.sort(compareCandidates)
}

/**
 * Finds member candidates reachable through hierarchy steps.
 * @param prepared - Prepared request and indexed facts.
 * @returns Deterministically ordered hierarchy candidates.
 */
function hierarchyCandidatesForRequest(prepared: PreparedResolution): ResolutionCandidate[] {
  const ownerId = prepared.request.ownerId
  if (ownerId === undefined) return []
  const pathsByOwner = tracePaths(ownerId, prepared.steps)
  const matches = prepared.allTargets.flatMap((target) => {
    if (
      target.ownerId === undefined ||
      target.name !== prepared.request.requested ||
      (prepared.request.symbolSpace !== undefined &&
        target.space !== prepared.request.symbolSpace) ||
      (prepared.request.memberSemantics !== undefined &&
        !sameMemberSemantics(target.memberSemantics, prepared.request.memberSemantics))
    ) {
      return []
    }
    const path = pathsByOwner.get(target.ownerId)
    return path === undefined ? [] : [{ target, path }]
  })
  const minimumDepth = Math.min(...matches.map(({ path }) => path.length))
  const nearest = matches.filter(({ path }) => path.length === minimumDepth)
  return preferEarlierBase(nearest)
    .map(({ target, path }) => candidateFor(prepared, target, path))
    .sort(compareCandidates)
}

/**
 * Applies adapter-emitted base-class precedence to equally distant hierarchy candidates.
 * `class C(A, B)` records `extends:0` for A and `extends:1` for B, so a tie between members
 * of A and B resolves to A, as Python's MRO does. Candidates reached through any other
 * relation, or with identical precedence, stay tied and therefore ambiguous.
 * @param candidates - Equally distant candidates with their provenance paths.
 * @returns The single preferred candidate, or all of them when precedence cannot decide.
 */
function preferEarlierBase<T extends { readonly path: readonly ResolutionStep[] }>(
  candidates: readonly T[],
): readonly T[] {
  if (candidates.length < 2) return candidates
  const keys = candidates.map((candidate) => {
    const precedences: number[] = []
    for (const step of candidate.path) {
      const [kind, order] = step.kind.split(':')
      if (kind !== 'extends' || order === undefined || !/^\d+$/.test(order)) return undefined
      precedences.push(Number(order))
    }
    return precedences
  })
  if (keys.some((key) => key === undefined)) return candidates
  const compare = (left: readonly number[], right: readonly number[]): number => {
    for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
      const difference = left[index]! - right[index]!
      if (difference !== 0) return difference
    }
    return 0
  }
  let best = 0
  for (let index = 1; index < keys.length; index += 1) {
    if (compare(keys[index]!, keys[best]!) < 0) best = index
  }
  const winners = candidates.filter((_candidate, index) => compare(keys[index]!, keys[best]!) === 0)
  return winners.length === 1 ? winners : candidates
}

/**
 * Traces one deterministic shortest path from an owner to every reachable ancestor.
 * @param startId - Owner identity where hierarchy traversal starts.
 * @param steps - Available resolution edges.
 * @returns Shortest path keyed by reached owner identity.
 */
function tracePaths(
  startId: string,
  steps: readonly ResolutionStep[],
): ReadonlyMap<string, readonly ResolutionStep[]> {
  const bySource = new Map<string, ResolutionStep[]>()
  for (const step of steps) {
    const entries = bySource.get(step.fromId) ?? []
    entries.push(step)
    bySource.set(step.fromId, entries)
  }
  const paths = new Map<string, readonly ResolutionStep[]>()
  let frontier: Array<{ id: string; path: readonly ResolutionStep[] }> = [{ id: startId, path: [] }]
  const visited = new Set<string>([startId])
  for (let depth = 0; depth < MAX_PATH_DEPTH && frontier.length > 0; depth += 1) {
    const next: Array<{ id: string; path: readonly ResolutionStep[] }> = []
    for (const entry of [...frontier].sort((left, right) => left.id.localeCompare(right.id))) {
      for (const step of [...(bySource.get(entry.id) ?? [])].sort(compareSteps)) {
        if (visited.has(step.toId)) continue
        visited.add(step.toId)
        const path = [...entry.path, step]
        paths.set(step.toId, path)
        next.push({ id: step.toId, path })
      }
    }
    frontier = next
  }
  return paths
}

/**
 * Traces a bounded, cycle-safe resolution path.
 * @param startId - Logical or binding identifier where traversal starts.
 * @param steps - Available resolution edges.
 * @returns Reachable provenance steps.
 */
function tracePath(startId: string, steps: readonly ResolutionStep[]): ResolutionStep[] {
  const bySource = new Map<string, ResolutionStep[]>()
  for (const step of steps) {
    const entries = bySource.get(step.fromId) ?? []
    entries.push(step)
    bySource.set(step.fromId, entries)
  }
  const path: ResolutionStep[] = []
  const visited = new Set<string>([startId])
  let frontier = [startId]
  for (let depth = 0; depth < MAX_PATH_DEPTH && frontier.length > 0; depth += 1) {
    const next: string[] = []
    for (const id of frontier.sort()) {
      for (const step of [...(bySource.get(id) ?? [])].sort(compareSteps)) {
        if (visited.has(step.toId)) continue
        visited.add(step.toId)
        path.push(step)
        next.push(step.toId)
      }
    }
    frontier = next
  }
  return path
}

/**
 * Loads a bounded transitive provenance closure with one batch query per depth.
 * @param store - Graph store containing resolution edges.
 * @param sourceIds - Initial logical or binding identifiers.
 * @returns Deterministically ordered reachable steps.
 */
async function loadResolutionSteps(
  store: GraphStore,
  sourceIds: readonly string[],
): Promise<ResolutionStep[]> {
  const visited = new Set<string>()
  const steps = new Map<string, ResolutionStep>()
  let frontier = [...new Set(sourceIds)].sort()
  for (let depth = 0; depth < MAX_PATH_DEPTH && frontier.length > 0; depth += 1) {
    const sources = frontier.filter((source) => !visited.has(source))
    if (sources.length === 0) break
    sources.forEach((source) => visited.add(source))
    const batch = await store.findResolutionSteps(sources)
    for (const step of batch) {
      steps.set(`${step.fromId}\u0000${step.kind}\u0000${step.toId}`, step)
    }
    frontier = batch.map((step) => step.toId)
  }
  return [...steps.values()].sort(compareSteps)
}

/**
 * Builds a candidate with declaration and path evidence.
 * @param prepared - Prepared request and indexed facts.
 * @param target - Matched logical target.
 * @param path - Provenance path leading to the target.
 * @returns Resolution candidate.
 */
function candidateFor(
  prepared: PreparedResolution,
  target: LogicalSymbol,
  path: readonly ResolutionStep[],
): ResolutionCandidate {
  return {
    target,
    declarations: prepared.declarationMap.get(target.id) ?? [],
    path: [...path],
  }
}

/**
 * Normalizes a request that embeds a logical identifier.
 * @param input - Original structured request.
 * @returns Normalized request.
 */
function normalizeRequest(input: ResolveSymbolReferenceInput): ResolveSymbolReferenceInput {
  const parsed = parseLogicalSymbol(input.requested)
  if (parsed === undefined) return input
  return {
    ...input,
    workspace: parsed.workspace,
    requested: parsed.name,
    logicalId: parsed.id,
    publicSurface: parsed.surface,
    symbolSpace: parsed.space,
    ...(parsed.ownerId !== undefined ? { ownerId: parsed.ownerId } : {}),
    ...(parsed.memberSemantics !== undefined ? { memberSemantics: parsed.memberSemantics } : {}),
  }
}

/**
 * Projects a request into a logical-symbol lookup.
 * @param input - Normalized request.
 * @returns Logical-symbol lookup.
 */
function expandedLookups(input: ResolveSymbolReferenceInput): LogicalSymbolLookup[] {
  const base = toLogicalLookup(input)
  if (!isExactLaneQuery(input.requested) || input.requested.startsWith('logical|')) return [base]
  const parts = input.requested.split(/::|\./).filter((part) => part.length > 0)
  if (parts.length < 2) return [base]
  return parts.map((name) => ({
    ...base,
    name,
    ownerId: undefined,
    memberKind: undefined,
    memberDispatch: undefined,
    memberAccessor: undefined,
    nativeKind: undefined,
  }))
}

/**
 * Resolves a single dotted or native member spelling by stored qualified name.
 * Other exact-lane text still needs a file or language adapter.
 * @param registry - Shared adapter registry. Absent adapters fall back to dotted parsing.
 * @param prepared - Prepared request and indexed facts.
 * @returns A terminal outcome, or undefined when the request is not an exact-lane member query.
 */
function resolveQualifiedMember(
  registry: AdapterRegistryPort | undefined,
  prepared: PreparedResolution,
): SymbolResolutionResult | undefined {
  const request = prepared.request
  if (!isExactLaneQuery(request.requested) || request.requested.startsWith('logical|'))
    return undefined
  if (request.ownerId !== undefined || request.logicalId !== undefined) return undefined
  const spelling = qualifiedLookupText(request.requested)
  const anchored = request.filePath ?? request.publicSurface
  if (spelling !== undefined) {
    // Without an anchoring file or surface nothing proves the graph still contains this
    // target uniquely, so known staleness blocks the answer.
    if (anchored === undefined && prepared.health.fresh === false) {
      return unresolved(prepared, prepared.health.reasonCodes[0] ?? 'GRAPH_STALE')
    }
    const byId = new Map(prepared.allTargets.map((target) => [target.id, target]))
    const matches = prepared.allTargets.filter((target) => {
      const stored = target.qualifiedName ?? deriveQualifiedName(target, byId)
      if (stored !== spelling) return false
      if (anchored !== undefined) return symbolVisibleIn(prepared, target, anchored)
      return request.workspace.length === 0 || target.workspace === request.workspace
    })
    if (matches.length === 0) return unresolved(prepared, 'REFERENCE_UNPROVEN')
    return outcomeFromTargets(prepared, matches, [])
  }
  if (anchored === undefined && request.language === undefined) {
    return unresolved(prepared, 'REFERENCE_UNPROVEN')
  }
  const parsed = parseAnchoredReference(registry, request, anchored)
  if (parsed.candidates.length === 0) return undefined
  if (parsed.candidates.length > 1) {
    return {
      request,
      status: 'ambiguous',
      reasonCode: 'AMBIGUOUS_LOGICAL_TARGET',
      health: prepared.health,
      resolvedTarget: null,
      target: null,
      candidates: [],
      path: [],
    }
  }
  const names = parsed.candidates[0]!.segments.map((segment) => segment.name)
  let ownerIds: Array<string | undefined> = [undefined]
  for (const name of names.slice(0, -1)) {
    const next: string[] = []
    for (const ownerId of ownerIds) {
      for (const target of prepared.allTargets) {
        if (target.name !== name || target.ownerId !== ownerId) continue
        if (!symbolVisibleIn(prepared, target, anchored)) continue
        next.push(target.id)
      }
    }
    ownerIds = [...new Set(next)]
  }
  const memberName = names.at(-1)!
  const members = prepared.allTargets.filter(
    (target) =>
      target.name === memberName &&
      target.ownerId !== undefined &&
      ownerIds.includes(target.ownerId) &&
      (request.memberSemantics === undefined ||
        sameMemberSemantics(target.memberSemantics, request.memberSemantics)) &&
      symbolVisibleIn(prepared, target, anchored),
  )
  if (members.length === 0) return unresolved(prepared, 'REFERENCE_UNPROVEN')
  return outcomeFromTargets(prepared, members, [])
}

/**
 * Parses anchored member text with the file or language adapter.
 * @param registry - Shared adapter registry.
 * @param request - Normalized resolution request.
 * @param anchored - File or public surface used to choose an adapter.
 * @returns Parsed member candidates. Empty when a named language has no parser.
 */
function parseAnchoredReference(
  registry: AdapterRegistryPort | undefined,
  request: ResolveSymbolReferenceInput,
  anchored: string | undefined,
): ReturnType<typeof parseDottedMemberReference> {
  const adapter =
    request.language !== undefined
      ? registry
          ?.getAdapters()
          .find((candidate) => candidate.languages().includes(request.language!))
      : anchored === undefined
        ? undefined
        : registry?.getAdapterForFile(anchored)
  if (adapter?.parseSymbolReference !== undefined)
    return adapter.parseSymbolReference(request.requested)
  if (registry !== undefined && request.language !== undefined) return { candidates: [] }
  return parseDottedMemberReference(request.requested)
}

/**
 * Checks whether a logical target is visible at the anchored file or workspace.
 * @param prepared - Prepared request and declaration map.
 * @param target - Candidate logical symbol.
 * @param anchored - File or public surface. Absent means the workspace must match.
 * @returns Whether the target is visible for this request.
 */
function symbolVisibleIn(
  prepared: PreparedResolution,
  target: LogicalSymbol,
  anchored: string | undefined,
): boolean {
  if (anchored === undefined) return target.workspace === prepared.request.workspace
  const declarations = prepared.declarationMap.get(target.id) ?? []
  return (
    declarations.some((declaration) => declaration.location.filePath === anchored) ||
    target.surface === anchored
  )
}

/**
 * Projects a request into a logical-symbol lookup.
 * @param input - Normalized request.
 * @returns Logical-symbol lookup.
 */
function toLogicalLookup(input: ResolveSymbolReferenceInput): LogicalSymbolLookup {
  return {
    workspace: input.workspace,
    surface: input.publicSurface,
    name: input.requested,
    space: input.symbolSpace,
    ownerId: input.ownerId,
    ...memberLookupAxes(input.memberSemantics),
  }
}

/**
 * Projects a request into a public-binding lookup.
 * @param input - Normalized request with a public surface.
 * @returns Public-binding lookup.
 */
function toPublicLookup(input: ResolveSymbolReferenceInput): PublicBindingLookup {
  return {
    surface: input.publicSurface!,
    exportedName: input.requested,
    space: input.symbolSpace,
  }
}

/**
 * Projects a request into a local-binding lookup.
 * @param input - Normalized request with a file path.
 * @returns Local-binding lookup.
 */
function toLocalLookup(input: ResolveSymbolReferenceInput): LocalBindingLookup {
  return {
    filePath: input.filePath!,
    scopeId: input.scopeId,
    localName: input.requested,
    space: input.symbolSpace,
  }
}

/**
 * Tests whether a logical target satisfies a request.
 * @param target - Candidate logical target.
 * @param input - Normalized request.
 * @returns Whether the target matches every supplied selector.
 */
function matchesRequest(target: LogicalSymbol, input: ResolveSymbolReferenceInput): boolean {
  return (
    target.workspace === input.workspace &&
    target.name === input.requested &&
    (input.publicSurface === undefined || target.surface === input.publicSurface) &&
    (input.symbolSpace === undefined || target.space === input.symbolSpace) &&
    (input.ownerId === undefined || target.ownerId === input.ownerId) &&
    (input.memberSemantics === undefined ||
      sameMemberSemantics(target.memberSemantics, input.memberSemantics))
  )
}

/**
 * Tests declaration evidence against request selectors.
 * @param declarations - Declarations for one logical target.
 * @param input - Normalized request.
 * @returns Whether at least one declaration matches.
 */
function hasMatchingDeclaration(
  declarations: readonly DeclarationOccurrence[],
  input: ResolveSymbolReferenceInput,
): boolean {
  return (
    declarations.length > 0 &&
    declarations.some(
      (declaration) =>
        (input.filePath === undefined || declaration.location.filePath === input.filePath) &&
        (input.kind === undefined || declaration.kind === input.kind),
    )
  )
}

/**
 * Groups declarations by logical symbol identifier.
 * @param declarations - Stored logical declarations.
 * @returns Deterministically ordered declaration groups.
 */
function groupDeclarations(
  declarations: readonly LogicalDeclaration[],
): ReadonlyMap<string, readonly DeclarationOccurrence[]> {
  const grouped = new Map<string, DeclarationOccurrence[]>()
  for (const item of declarations) {
    const values = grouped.get(item.logicalSymbolId) ?? []
    values.push(item.declaration)
    grouped.set(item.logicalSymbolId, values)
  }
  for (const values of grouped.values()) {
    values.sort((left, right) =>
      `${left.location.filePath}:${left.location.line}:${left.location.column}`.localeCompare(
        `${right.location.filePath}:${right.location.line}:${right.location.column}`,
      ),
    )
  }
  return grouped
}

/**
 * Removes duplicate logical targets.
 * @param targets - Logical targets to normalize.
 * @returns Deterministically ordered unique targets.
 */
function deduplicateTargets(targets: readonly LogicalSymbol[]): LogicalSymbol[] {
  return [...new Map(targets.map((target) => [target.id, target])).values()].sort(compareTargets)
}

/**
 * Removes duplicate structured logical-symbol lookups.
 * @param lookups - Lookup tuples to normalize.
 * @returns Stable unique lookup list.
 */
function deduplicateLogicalLookups(lookups: readonly LogicalSymbolLookup[]): LogicalSymbolLookup[] {
  return [
    ...new Map(
      lookups.map((lookup) => [
        JSON.stringify([
          lookup.workspace,
          lookup.surface,
          lookup.name,
          lookup.space,
          lookup.ownerId,
          lookup.memberKind,
          lookup.memberDispatch,
          lookup.memberAccessor,
          lookup.nativeKind,
        ]),
        lookup,
      ]),
    ).values(),
  ]
}

/**
 * Removes candidates that point at the same logical target.
 * @param candidates - Resolution candidates to normalize.
 * @returns Deterministically ordered unique candidates.
 */
function deduplicateCandidates(candidates: readonly ResolutionCandidate[]): ResolutionCandidate[] {
  return [
    ...new Map(candidates.map((candidate) => [candidate.target.id, candidate])).values(),
  ].sort(compareCandidates)
}

/**
 * Compares logical targets by stable identity fields.
 * @param left - First logical target.
 * @param right - Second logical target.
 * @returns Locale comparison result.
 */
function compareTargets(left: LogicalSymbol, right: LogicalSymbol): number {
  return [
    left.workspace,
    left.surface,
    left.ownerId ?? '',
    left.space,
    left.name,
    memberSemanticsKey(left.memberSemantics),
    left.id,
  ]
    .join('\u0000')
    .localeCompare(
      [
        right.workspace,
        right.surface,
        right.ownerId ?? '',
        right.space,
        right.name,
        memberSemanticsKey(right.memberSemantics),
        right.id,
      ].join('\u0000'),
    )
}

/**
 * Compares candidates by their logical targets.
 * @param left - First candidate.
 * @param right - Second candidate.
 * @returns Locale comparison result.
 */
function compareCandidates(left: ResolutionCandidate, right: ResolutionCandidate): number {
  return compareTargets(left.target, right.target)
}

/**
 * Projects member semantics into lookup axes. An absent axis stays undefined.
 * @param semantics - Requested member semantics, when the caller supplied them.
 * @returns The four lookup axes.
 */
function memberLookupAxes(
  semantics: MemberSemantics | undefined,
): Pick<LogicalSymbolLookup, 'memberKind' | 'memberDispatch' | 'memberAccessor' | 'nativeKind'> {
  return {
    memberKind: semantics?.kind,
    memberDispatch: semantics?.dispatch,
    memberAccessor: semantics?.accessor,
    nativeKind: semantics?.nativeKind,
  }
}

/**
 * Compares stored member semantics with a requested form.
 * @param stored - Semantics stored on the logical symbol.
 * @param requested - Semantics required by the request.
 * @returns Whether every supplied axis matches.
 */
function sameMemberSemantics(
  stored: MemberSemantics | undefined,
  requested: MemberSemantics,
): boolean {
  return (
    stored?.kind === requested.kind &&
    stored.dispatch === requested.dispatch &&
    stored.accessor === requested.accessor &&
    stored.nativeKind === requested.nativeKind
  )
}

/**
 * Builds a stable sort key for member semantics.
 * @param semantics - Member semantics to encode. Absent semantics sort first.
 * @returns A delimiter-joined key.
 */
function memberSemanticsKey(semantics: MemberSemantics | undefined): string {
  if (semantics === undefined) return ''
  return [
    semantics.kind,
    semantics.dispatch ?? '',
    semantics.accessor ?? '',
    semantics.nativeKind ?? '',
  ].join('\u0000')
}

/**
 * Compares resolution steps by stable edge identity.
 * @param left - First resolution step.
 * @param right - Second resolution step.
 * @returns Locale comparison result.
 */
function compareSteps(left: ResolutionStep, right: ResolutionStep): number {
  return `${left.fromId}\u0000${left.kind}\u0000${left.toId}`.localeCompare(
    `${right.fromId}\u0000${right.kind}\u0000${right.toId}`,
  )
}

/**
 * Validates request selectors for mutual exclusivity and valid coordinates.
 * @param input - The structured reference request.
 * @returns Stable reason code when invalid, or null when valid.
 */
function validateRequest(input: ResolveSymbolReferenceInput): string | null {
  const parsedLogical = parseLogicalSymbol(input.requested)
  const hasLogicalId = input.logicalId !== undefined || parsedLogical !== undefined
  const hasDeclarationId = input.declarationSymbolId !== undefined
  const hasPosition = input.position !== undefined

  const count = (hasLogicalId ? 1 : 0) + (hasDeclarationId ? 1 : 0) + (hasPosition ? 1 : 0)
  if (count > 1) {
    return 'INVALID_SELECTOR'
  }

  if (hasPosition) {
    const { position, filePath } = input
    if (position === undefined || position.line < 1 || position.column < 0 || !filePath) {
      return 'INVALID_SELECTOR'
    }
  }

  return null
}

/**
 * Tests whether a request specifically addresses one physical declaration occurrence.
 * @param input - The structured reference request.
 * @returns True when the request uses an exact declaration identifier or file position.
 */
function isExactDeclarationRequest(input: ResolveSymbolReferenceInput): boolean {
  return input.declarationSymbolId !== undefined || input.position !== undefined
}
