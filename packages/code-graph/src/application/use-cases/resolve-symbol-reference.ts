import {
  type LocalBindingLookup,
  type LogicalDeclaration,
  type LogicalSymbolLookup,
  type PublicBindingLookup,
  type GraphStore,
} from '../../domain/ports/graph-store.js'
import { IndexCoverageStatus } from '../../domain/value-objects/index-session.js'
import {
  FreshnessState,
  IndexedResourceKind,
  type IndexedResourceFreshnessResult,
  type IndexedResourceKey,
} from '../../domain/value-objects/indexed-input-freshness.js'
import {
  parseLogicalSymbol,
  type DeclarationOccurrence,
  type LogicalSymbol,
  type ResolutionCandidate,
  type ResolutionHealth,
  type ResolutionStep,
  type ResolveSymbolReferenceInput,
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
   */
  constructor(
    private readonly store: GraphStore,
    private readonly getHealth: () => Promise<ResolutionHealth>,
    private readonly assessResources?: (
      resources: readonly IndexedResourceKey[],
    ) => Promise<readonly IndexedResourceFreshnessResult[]>,
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
    const requests = inputs.map(normalizeRequest)
    const logicalLookups = requests.map(toLogicalLookup)
    const publicLookups = requests
      .filter((input) => input.publicSurface !== undefined)
      .map(toPublicLookup)
    const localLookups = requests.filter((input) => input.filePath !== undefined).map(toLocalLookup)

    const [logicalSymbols, publicBindings, localBindings] = await Promise.all([
      this.store.findLogicalSymbols(logicalLookups),
      publicLookups.length === 0 ? [] : this.store.findPublicBindings(publicLookups),
      localLookups.length === 0 ? [] : this.store.findLocalBindings(localLookups),
    ])

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
            memberForm: request.memberForm,
          }),
        )
      }),
    )
    const [boundTargets, hierarchyTargets] = await Promise.all([
      targetIds.size === 0 ? [] : this.store.findLogicalSymbolsByIds([...targetIds]),
      hierarchyLookups.length === 0 ? [] : this.store.findLogicalSymbols(hierarchyLookups),
    ])
    const allTargets = deduplicateTargets([...logicalSymbols, ...boundTargets, ...hierarchyTargets])
    const declarations = await this.store.findDeclarations(allTargets.map((target) => target.id))
    const declarationMap = groupDeclarations(declarations)
    const resourceFiles = [
      ...requests.flatMap((request) => {
        const addressedResource = request.filePath ?? request.publicSurface
        return addressedResource === undefined ? [] : [addressedResource]
      }),
      ...declarations.map((declaration) => declaration.declaration.location.filePath),
    ]
    const resources = deduplicateFileResources(resourceFiles, requests)
    const [coverage, resourceFreshness] = await Promise.all([
      this.store.findIndexCoverage([...new Set(resourceFiles)].sort()),
      this.assessResources === undefined || resources.length === 0
        ? []
        : this.assessResources(resources),
    ])
    const freshnessMap = new Map(
      resourceFreshness.map((result) => [resourceKey(result.workspace, result.resourceId), result]),
    )

    return requests.map((request) =>
      resolvePrepared({
        request,
        health,
        logicalSymbols,
        publicBindings,
        localBindings,
        allTargets,
        declarationMap,
        steps,
        coverage,
        targetedFreshness: (() => {
          const addressedResource = request.filePath ?? request.publicSurface
          return addressedResource === undefined
            ? undefined
            : freshnessMap.get(resourceKey(request.workspace, addressedResource))
        })(),
        resourceFreshness: freshnessMap,
        freshnessAssessmentEnabled: this.assessResources !== undefined,
      }),
    )
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
 * @param prepared - Prepared request and indexed facts.
 * @returns Conservative resolution outcome.
 */
function resolvePrepared(prepared: PreparedResolution): SymbolResolutionResult {
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
    return outcomeFromCandidates(prepared, publicCandidates)
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
 * @returns Resolution outcome.
 */
function outcomeFromCandidates(
  prepared: PreparedResolution,
  candidates: readonly ResolutionCandidate[],
): SymbolResolutionResult {
  const unique = deduplicateCandidates(candidates)
  const evidenceIssue = candidateEvidenceIssue(prepared, unique)
  if (evidenceIssue !== null) return unresolved(prepared, evidenceIssue)
  if (unique.length === 1) {
    const candidate = unique[0]!
    return {
      request: prepared.request,
      status: 'resolved',
      reasonCode: null,
      health: prepared.health,
      target: candidate.target,
      candidates: unique,
      path: candidate.path,
    }
  }
  return {
    request: prepared.request,
    status: 'ambiguous',
    reasonCode: 'AMBIGUOUS_MULTIPLE_TARGETS',
    health: prepared.health,
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
  const separator = filePath.indexOf(':')
  return separator > 0 ? filePath.slice(0, separator) : fallback
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
  const graphReason =
    prepared.targetedFreshness !== undefined && !targetedCurrent
      ? (targetedReason ?? 'RESOURCE_FRESHNESS_UNKNOWN')
      : !targetedCurrent && prepared.health.fresh !== true
        ? (prepared.health.reasonCodes[0] ?? 'GRAPH_FRESHNESS_UNKNOWN')
        : prepared.health.complete !== true
          ? (prepared.health.reasonCodes[0] ?? 'GRAPH_COVERAGE_INCOMPLETE')
          : null
  if (graphReason !== null) return unresolved(prepared, graphReason)

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
      (prepared.request.memberForm !== undefined &&
        target.memberForm !== prepared.request.memberForm)
    ) {
      return []
    }
    const path = pathsByOwner.get(target.ownerId)
    return path === undefined ? [] : [{ target, path }]
  })
  const minimumDepth = Math.min(...matches.map(({ path }) => path.length))
  return matches
    .filter(({ path }) => path.length === minimumDepth)
    .map(({ target, path }) => candidateFor(prepared, target, path))
    .sort(compareCandidates)
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
    ...(parsed.memberForm !== undefined ? { memberForm: parsed.memberForm } : {}),
  }
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
    memberForm: input.memberForm,
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
    (input.memberForm === undefined || target.memberForm === input.memberForm)
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
          lookup.memberForm,
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
    left.memberForm ?? '',
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
        right.memberForm ?? '',
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
