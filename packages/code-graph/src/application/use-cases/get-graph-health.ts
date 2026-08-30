import { type SpecdConfig, type VcsAdapter } from '@specd/core'
import { readFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { type CodeGraphHostPort } from '../ports/code-graph-host-port.js'
import { type GraphStatistics } from '../../domain/value-objects/graph-statistics.js'
import { type WorkspaceIndexTarget } from '../../domain/value-objects/index-options.js'
import {
  IndexCoverageStatus,
  type IndexCoverage,
} from '../../domain/value-objects/index-session.js'
import { isGraphStale } from '../../domain/services/is-graph-stale.js'
import {
  parseFingerprintMap,
  detectFingerprintMismatch,
} from './_shared/compute-graph-fingerprint.js'
import { buildProjectGraphConfig } from '../services/build-project-graph-config.js'
import { computeContentHash } from './compute-content-hash.js'
import { resolveEffectiveGraphConfig } from './_shared/resolve-effective-graph-config.js'
import { discoverFiles } from './discover-files.js'
import {
  buildGraphInputVisibilitySnapshot,
  rebaseRepositoryPath,
} from '../services/graph-input-visibility.js'
import { AssessIndexedResourceFreshness } from './assess-indexed-resource-freshness.js'
import {
  FreshnessMode,
  FreshnessState,
  IndexedResourceKind,
  type WorkspaceFreshnessResult,
} from '../../domain/value-objects/indexed-input-freshness.js'

/** Input for graph health diagnostics on an open provider. */
export interface GetGraphHealthInput {
  readonly config: SpecdConfig
  readonly provider: CodeGraphHostPort
  readonly codeGraphVersion: string
  readonly workspaces?: readonly WorkspaceIndexTarget[]
}

/** Graph statistics enriched with staleness and fingerprint diagnostics. */
export interface GetGraphHealthResult extends GraphStatistics {
  readonly state: FreshnessState
  readonly knownStaleSinceLastIndex: boolean
  readonly workspaces: readonly WorkspaceFreshnessResult[]
  readonly stale: boolean | null
  readonly currentRef: string | null
  readonly fingerprintMismatch: boolean | null
  readonly contentFresh: boolean | null
  readonly coverageComplete: boolean | null
  readonly coverage: IndexCoverageHealthSummary
  readonly schemaCompatible: boolean
  readonly generationCurrent: boolean
  readonly reasonCodes: readonly string[]
}

/** Deterministic aggregate of persisted per-file index coverage. */
export interface IndexCoverageHealthSummary {
  readonly total: number
  readonly byStatus: Readonly<Record<IndexCoverageStatus, number>>
  readonly reasons: readonly string[]
}

/**
 * Returns graph statistics plus VCS staleness and derivation fingerprint diagnostics.
 */
export class GetGraphHealth {
  /** Creates graph health diagnostics with a composition-supplied VCS resolver.
   * @param createVcsAdapter - Resolver for the current VCS reference.
   */
  constructor(private readonly createVcsAdapter: (projectRoot: string) => Promise<VcsAdapter>) {}
  /**
   * Executes the use case.
   *
   * @param input - Open provider, project config, and optional workspace targets
   * @returns Enriched graph health snapshot
   */
  async execute(input: GetGraphHealthInput): Promise<GetGraphHealthResult> {
    const stats = await input.provider.getStatistics()
    const workspaceNames = [
      ...new Set(input.workspaces?.map((workspace) => workspace.name) ?? []),
    ].sort()
    const latches = await readFreshnessLatches(input.provider, workspaceNames)
    const coverage = await readCoverageHealth(input.provider, stats.lastIndexedAt !== undefined)
    if (latches?.graph === true) {
      return {
        ...stats,
        state: FreshnessState.Stale,
        knownStaleSinceLastIndex: true,
        workspaces: workspaceNames.map((workspace) => ({
          workspace,
          state:
            latches.workspaces[workspace] === true ? FreshnessState.Stale : FreshnessState.Unknown,
          mode: FreshnessMode.Filesystem,
          knownStaleSinceLastIndex: latches.workspaces[workspace] === true,
          reasons:
            latches.workspaces[workspace] === true ? ['CONTENT_KNOWN_STALE'] : ['NOT_ASSESSED'],
        })),
        stale: null,
        currentRef: null,
        fingerprintMismatch: null,
        contentFresh: false,
        coverageComplete: coverage.complete,
        coverage: coverage.summary,
        schemaCompatible: true,
        generationCurrent: true,
        reasonCodes: coverage.inconsistent
          ? ['CONTENT_KNOWN_STALE', 'GRAPH_CONTENT_INCONSISTENT']
          : ['CONTENT_KNOWN_STALE'],
      }
    }

    let currentRef: string | null = null
    let vcsRoot: string | null = null
    let vcsCandidates: ReadonlySet<string> | null = null
    let vcsAssessmentUnknown = false
    const vcsGroups = new Map<string, VcsAdapter>()
    try {
      const vcs = await this.createVcsAdapter(input.config.projectRoot)
      currentRef = await vcs.ref()
      vcsRoot = vcs.rootDir()
      vcsGroups.set(vcsRoot, vcs)
    } catch {
      // No VCS or ref unavailable
    }
    for (const workspace of input.workspaces ?? []) {
      try {
        const vcs = await this.createVcsAdapter(workspace.codeRoot)
        vcsGroups.set(vcs.rootDir(), vcs)
      } catch {
        // This workspace uses filesystem freshness.
      }
    }
    if (stats.lastIndexedRef !== null && vcsGroups.size > 0) {
      const candidates = new Set<string>()
      try {
        for (const [repositoryRoot, vcs] of vcsGroups) {
          for (const repositoryPath of await vcs.modifiedFiles(stats.lastIndexedRef)) {
            const projectPath = rebaseRepositoryPath(
              repositoryRoot,
              input.config.projectRoot,
              repositoryPath,
            )
            if (projectPath !== null) candidates.add(projectPath)
          }
        }
        vcsCandidates = candidates
      } catch {
        vcsCandidates = null
        vcsAssessmentUnknown = true
      }
    }

    const detailedFreshness = await assessObservedContent(
      input,
      latches,
      vcsRoot,
      vcsCandidates,
      vcsAssessmentUnknown,
      coverage.facts,
    )
    const indexedContentFresh =
      detailedFreshness === null
        ? await compareIndexedContent(input, vcsRoot)
        : detailedFreshness.state === FreshnessState.Unknown
          ? null
          : detailedFreshness.state === FreshnessState.Current
    const contentFresh = coverage.inconsistent ? false : indexedContentFresh
    const stale = isGraphStale(stats.lastIndexedRef, currentRef)

    let fingerprintMismatch: boolean | null = null
    if (input.workspaces !== undefined && stats.graphFingerprint !== null) {
      try {
        const storedMap = parseFingerprintMap(stats.graphFingerprint)
        const graphConfig = buildProjectGraphConfig(input.config)
        fingerprintMismatch = detectFingerprintMismatch(
          storedMap,
          input.codeGraphVersion,
          input.config.projectRoot,
          [...input.workspaces],
          graphConfig,
        )
      } catch {
        fingerprintMismatch = null
      }
    }

    const coverageComplete = coverage.complete
    const reasonCodes = graphHealthReasonCodes({
      stale,
      vcsRequired: stats.lastIndexedRef !== null,
      contentFresh,
      fingerprintMismatch,
      coverageComplete,
      coverageReasons: coverage.summary.reasons,
      contentInconsistent: coverage.inconsistent,
    })

    const state = aggregateCanonicalHealth({
      contentState:
        detailedFreshness?.state ??
        (contentFresh === null
          ? FreshnessState.Unknown
          : contentFresh
            ? FreshnessState.Current
            : FreshnessState.Stale),
      stale,
      vcsRequired: stats.lastIndexedRef !== null,
      fingerprintMismatch,
      coverageComplete,
      schemaCompatible: true,
      generationCurrent: true,
    })

    return {
      ...stats,
      state,
      knownStaleSinceLastIndex: latches?.graph ?? false,
      workspaces: detailedFreshness?.workspaces ?? [],
      stale,
      currentRef,
      fingerprintMismatch,
      contentFresh,
      coverageComplete,
      coverage: coverage.summary,
      schemaCompatible: true,
      generationCurrent: true,
      reasonCodes,
    }
  }
}

/**
 * Reads and aggregates persisted coverage without inspecting source inputs.
 * @param provider - Open provider exposing aggregate coverage facts.
 * @param hasIndexedGeneration - Whether statistics prove an index generation exists.
 * @returns Completeness and deterministic coverage summary.
 */
async function readCoverageHealth(
  provider: CodeGraphHostPort,
  hasIndexedGeneration: boolean,
): Promise<{
  readonly complete: boolean | null
  readonly summary: IndexCoverageHealthSummary
  readonly facts: readonly IndexCoverage[]
  readonly inconsistent: boolean
}> {
  const empty = emptyCoverageSummary()
  if (!hasIndexedGeneration) {
    return { complete: null, summary: empty, facts: [], inconsistent: false }
  }
  if (provider.getAllIndexCoverage === undefined) {
    return { complete: null, summary: empty, facts: [], inconsistent: false }
  }
  try {
    const facts = await provider.getAllIndexCoverage()
    const [files, documents] =
      provider.getAllFiles === undefined || provider.getAllDocuments === undefined
        ? [[], []]
        : await Promise.all([provider.getAllFiles(), provider.getAllDocuments()])
    const persistedPaths = new Set([...files, ...documents].map((item) => item.path))
    const inconsistent =
      provider.getAllFiles !== undefined &&
      provider.getAllDocuments !== undefined &&
      facts.some(
        (fact) => fact.status === IndexCoverageStatus.Indexed && !persistedPaths.has(fact.filePath),
      )
    const summary = summarizeCoverage(facts, inconsistent)
    return {
      complete:
        facts.every(
          (fact) =>
            fact.status !== IndexCoverageStatus.ParseFailed &&
            fact.status !== IndexCoverageStatus.Partial,
        ) && !inconsistent,
      summary,
      facts,
      inconsistent,
    }
  } catch {
    return { complete: null, summary: empty, facts: [], inconsistent: false }
  }
}

/**
 * Creates the zero-valued coverage summary used before indexing or unavailable evidence.
 * @returns Empty deterministic coverage summary.
 */
function emptyCoverageSummary(): IndexCoverageHealthSummary {
  return {
    total: 0,
    byStatus: {
      [IndexCoverageStatus.Indexed]: 0,
      [IndexCoverageStatus.Excluded]: 0,
      [IndexCoverageStatus.Unsupported]: 0,
      [IndexCoverageStatus.ParseFailed]: 0,
      [IndexCoverageStatus.Partial]: 0,
    },
    reasons: [],
  }
}

/**
 * Aggregates persisted coverage facts into stable counts and reason codes.
 * @param facts - Persisted per-source coverage facts.
 * @param inconsistent - Whether indexed facts reference absent physical nodes.
 * @returns Deterministic count and reason summary.
 */
function summarizeCoverage(
  facts: readonly IndexCoverage[],
  inconsistent = false,
): IndexCoverageHealthSummary {
  const summary = emptyCoverageSummary()
  const byStatus = { ...summary.byStatus }
  for (const fact of facts) byStatus[fact.status] += 1
  return {
    total: facts.length,
    byStatus,
    reasons: [
      ...new Set(facts.flatMap((fact) => (fact.reason === undefined ? [] : [fact.reason]))),
      ...(inconsistent ? ['indexed-node-missing'] : []),
    ].sort(),
  }
}

/**
 * Composes every canonical health dimension with stale-over-unknown precedence.
 * @param input - Independent canonical health dimensions.
 * @param input.contentState - Working-tree/content freshness.
 * @param input.stale - VCS reference comparison.
 * @param input.vcsRequired - Whether the indexed generation has VCS evidence to compare.
 * @param input.fingerprintMismatch - Derivation compatibility state.
 * @param input.coverageComplete - Persisted coverage completeness.
 * @param input.schemaCompatible - Backend schema compatibility.
 * @param input.generationCurrent - Provider generation compatibility.
 * @returns Aggregate tri-state health.
 */
function aggregateCanonicalHealth(input: {
  readonly contentState: FreshnessState
  readonly stale: boolean | null
  readonly vcsRequired: boolean
  readonly fingerprintMismatch: boolean | null
  readonly coverageComplete: boolean | null
  readonly schemaCompatible: boolean
  readonly generationCurrent: boolean
}): FreshnessState {
  if (
    input.contentState === FreshnessState.Stale ||
    input.stale === true ||
    input.fingerprintMismatch === true ||
    !input.schemaCompatible ||
    !input.generationCurrent
  ) {
    return FreshnessState.Stale
  }
  if (
    input.contentState === FreshnessState.Unknown ||
    (input.vcsRequired && input.stale === null) ||
    input.fingerprintMismatch === null ||
    input.coverageComplete !== true
  ) {
    return FreshnessState.Unknown
  }
  return FreshnessState.Current
}

/**
 * Reads optional latch support without converting provider incompatibility into staleness.
 * @param provider - Open graph provider.
 * @param workspaces - Workspace names to project.
 * @returns Latch state or null when unsupported.
 */
async function readFreshnessLatches(provider: CodeGraphHostPort, workspaces: readonly string[]) {
  if (provider.getFreshnessLatches === undefined) return null
  try {
    return await provider.getFreshnessLatches(workspaces)
  } catch {
    return null
  }
}

/**
 * Assesses persisted observations and returns deterministic workspace projections.
 * @param input - Health assessment input.
 * @param latches - Previously read latch state.
 * @param vcsRoot - Detected repository root.
 * @param vcsCandidates - Project-relative inputs changed since the indexed revision.
 * @param vcsAssessmentUnknown - Whether repository diff acquisition failed.
 * @param coverageFacts - Persisted outcomes for every source target considered by indexing.
 * @returns Aggregate and workspace freshness or null.
 */
async function assessObservedContent(
  input: GetGraphHealthInput,
  latches: Awaited<ReturnType<typeof readFreshnessLatches>>,
  vcsRoot: string | null,
  vcsCandidates: ReadonlySet<string> | null,
  vcsAssessmentUnknown: boolean,
  coverageFacts: readonly IndexCoverage[],
): Promise<{
  readonly state: FreshnessState
  readonly workspaces: readonly WorkspaceFreshnessResult[]
} | null> {
  if (
    input.workspaces === undefined ||
    input.provider.getAllFiles === undefined ||
    input.provider.getAllDocuments === undefined ||
    input.provider.getAllSpecs === undefined ||
    input.provider.getIndexedInputObservations === undefined ||
    input.provider.markIndexedInputsStale === undefined ||
    input.provider.updateIndexedInputObservations === undefined ||
    input.provider.markWorkspacesAndGraphStaleSinceLastIndex === undefined
  ) {
    return null
  }
  if (vcsAssessmentUnknown) {
    return {
      state: FreshnessState.Unknown,
      workspaces: (input.workspaces ?? []).map((workspace) => ({
        workspace: workspace.name,
        state: FreshnessState.Unknown,
        mode: FreshnessMode.Vcs,
        knownStaleSinceLastIndex: latches?.workspaces[workspace.name] ?? false,
        reasons: ['VCS_DIFF_FAILED'],
      })),
    }
  }
  try {
    const [files, documents, specs] = await Promise.all([
      input.provider.getAllFiles(),
      input.provider.getAllDocuments(),
      input.provider.getAllSpecs(),
    ])
    const resources = [
      ...files.map((file) => ({
        workspace: file.workspace,
        resourceKind: IndexedResourceKind.File,
        resourceId: file.path,
      })),
      ...documents.map((document) => ({
        workspace: document.workspace,
        resourceKind: IndexedResourceKind.Document,
        resourceId: document.path,
      })),
      ...specs.map((spec) => ({
        workspace: spec.workspace,
        resourceKind: IndexedResourceKind.Spec,
        resourceId: spec.specId,
      })),
    ]
    if (resources.length === 0) return null
    const assessor = new AssessIndexedResourceFreshness({
      getIndexedInputObservations: input.provider.getIndexedInputObservations.bind(input.provider),
      markIndexedInputsStale: input.provider.markIndexedInputsStale.bind(input.provider),
      updateIndexedInputObservations: input.provider.updateIndexedInputObservations.bind(
        input.provider,
      ),
      markWorkspacesAndGraphStaleSinceLastIndex:
        input.provider.markWorkspacesAndGraphStaleSinceLastIndex.bind(input.provider),
    })
    const roots = new Map(
      input.workspaces.map((workspace) => [workspace.name, input.config.projectRoot]),
    )
    roots.set('root', input.config.projectRoot)
    const observations = await input.provider.getIndexedInputObservations(resources)
    const locatorByResource = new Map(
      [...files, ...documents].map((node) => [node.path, node.configRelativePath]),
    )
    const specLocators = new Map<string, Set<string>>()
    for (const observation of observations) {
      if (observation.resourceKind !== IndexedResourceKind.Spec) continue
      const locators = specLocators.get(observation.resourceId) ?? new Set<string>()
      locators.add(observation.inputLocator)
      specLocators.set(observation.resourceId, locators)
    }
    const resourcesToAssess =
      vcsCandidates === null
        ? resources
        : resources.filter(
            (resource) =>
              vcsCandidates.has(locatorByResource.get(resource.resourceId) ?? '') ||
              [...(specLocators.get(resource.resourceId) ?? [])].some((locator) =>
                vcsCandidates.has(locator),
              ),
          )
    const assessedCandidates = await assessor.execute({
      resources: resourcesToAssess,
      workspaceRoots: roots,
      forceFilesystemHash: vcsCandidates !== null,
    })
    const assessedIds = new Set(
      assessedCandidates.map((resource) =>
        JSON.stringify([resource.workspace, resource.resourceKind, resource.resourceId]),
      ),
    )
    const assessed = [
      ...assessedCandidates,
      ...resources
        .filter(
          (resource) =>
            !assessedIds.has(
              JSON.stringify([resource.workspace, resource.resourceKind, resource.resourceId]),
            ),
        )
        .map((resource) => ({
          ...resource,
          state: FreshnessState.Current,
          reasons: ['VCS_UNMODIFIED'],
        })),
    ]
    const graphConfig = buildProjectGraphConfig(input.config)
    const effective = resolveEffectiveGraphConfig(
      input.config.projectRoot,
      input.workspaces,
      graphConfig,
    )
    const visibility = buildGraphInputVisibilitySnapshot(
      input.config.projectRoot,
      input.workspaces,
      graphConfig,
      vcsRoot,
      observations,
    )
    const membershipChanged = new Set<string>()
    const workspaceTargets = new Map(
      input.workspaces.map((workspace) => [workspace.name, workspace]),
    )
    for (const workspace of new Set(resources.map((resource) => resource.workspace))) {
      const coverageLocators = coverageFacts
        .filter((fact) => fact.filePath.startsWith(`${workspace}:`))
        .map((fact) => {
          const target = workspaceTargets.get(workspace)
          if (target === undefined) return null
          const workspaceRelativePath = fact.filePath.slice(workspace.length + 1)
          return relative(input.config.projectRoot, resolve(target.codeRoot, workspaceRelativePath))
            .replaceAll('\\', '/')
            .replace(/^\.\//, '')
        })
        .filter((locator): locator is string => locator !== null)
      const indexedLocators = new Set(
        coverageLocators.length > 0
          ? coverageLocators
          : [...files, ...documents]
              .filter((node) => node.workspace === workspace)
              .map((node) => node.configRelativePath),
      )
      const currentLocators = new Set(visibility.currentInputs.get(workspace)?.keys() ?? [])
      if (
        indexedLocators.size !== currentLocators.size ||
        [...indexedLocators].some((locator) => !currentLocators.has(locator))
      ) {
        membershipChanged.add(workspace)
      }
    }
    if (membershipChanged.size > 0) {
      await input.provider.markWorkspacesAndGraphStaleSinceLastIndex([...membershipChanged].sort())
    }
    const workspaces = [...new Set(resources.map((resource) => resource.workspace))]
      .sort()
      .map((workspace): WorkspaceFreshnessResult => {
        const states = assessed.filter((result) => result.workspace === workspace)
        const state = membershipChanged.has(workspace)
          ? FreshnessState.Stale
          : aggregateFreshness(states.map((result) => result.state))
        const respectGitignore = effective.workspaces.get(workspace)?.respectGitignore ?? true
        return {
          workspace,
          state,
          mode:
            vcsRoot === null
              ? FreshnessMode.Filesystem
              : respectGitignore
                ? FreshnessMode.Vcs
                : FreshnessMode.Hybrid,
          knownStaleSinceLastIndex: latches?.workspaces[workspace] ?? false,
          reasons: [
            ...new Set([
              ...states.flatMap((result) => result.reasons),
              ...(membershipChanged.has(workspace) ? ['FILESET_CHANGED'] : []),
            ]),
          ].sort(),
        }
      })
    return { state: aggregateFreshness(workspaces.map((workspace) => workspace.state)), workspaces }
  } catch {
    return null
  }
}

/**
 * Aggregates workspace/resource states using stale-over-unknown precedence.
 * @param states - States to aggregate.
 * @returns Aggregate freshness state.
 */
function aggregateFreshness(states: readonly FreshnessState[]): FreshnessState {
  if (states.some((state) => state === FreshnessState.Stale)) return FreshnessState.Stale
  if (states.some((state) => state === FreshnessState.Unknown)) return FreshnessState.Unknown
  return states.length === 0 ? FreshnessState.Unknown : FreshnessState.Current
}

/**
 * Compares persisted source hashes with current working-tree content.
 * @param input - Health input containing the project root and open provider.
 * @param vcsRoot - Resolved VCS root used to apply the same ignore rules as indexing.
 * @returns Whether indexed files are unchanged, or null when files cannot be inspected.
 */
async function compareIndexedContent(
  input: GetGraphHealthInput,
  vcsRoot: string | null,
): Promise<boolean | null> {
  if (
    input.provider.getAllFiles === undefined ||
    input.provider.getAllDocuments === undefined ||
    input.workspaces === undefined
  ) {
    return null
  }
  try {
    const [files, documents] = await Promise.all([
      input.provider.getAllFiles(),
      input.provider.getAllDocuments(),
    ])
    const indexed = new Map(
      [...files, ...documents].map((node) => [node.configRelativePath, node.contentHash]),
    )
    if (indexed.size === 0) return null

    const graphConfig = buildProjectGraphConfig(input.config)
    const effective = resolveEffectiveGraphConfig(
      input.config.projectRoot,
      input.workspaces,
      graphConfig,
    )
    const discovered = new Map<string, string>()
    let inspectionFailed = false
    const onInspectionError = (): void => {
      inspectionFailed = true
    }

    for (const workspace of input.workspaces) {
      const workspaceGraph = effective.workspaces.get(workspace.name)
      for (const relPath of discoverFiles(workspace.codeRoot, undefined, {
        respectGitignore: workspaceGraph?.respectGitignore ?? true,
        vcsRoot,
        ...(workspaceGraph?.excludePaths !== undefined
          ? { excludePaths: workspaceGraph.excludePaths }
          : {}),
        ...(workspaceGraph?.allowedPaths !== undefined
          ? { allowedPaths: workspaceGraph.allowedPaths }
          : {}),
        onInspectionError,
      })) {
        const absolutePath = join(workspace.codeRoot, relPath)
        const configRelativePath = relative(input.config.projectRoot, absolutePath).replaceAll(
          '\\',
          '/',
        )
        discovered.set(
          configRelativePath.startsWith('./') ? configRelativePath.slice(2) : configRelativePath,
          absolutePath,
        )
      }
    }

    if (effective.includePaths.length > 0) {
      for (const relPath of discoverFiles(input.config.projectRoot, undefined, {
        allowedPaths: effective.includePaths,
        excludePaths: effective.rootExcludePaths,
        vcsRoot,
        onInspectionError,
      })) {
        const absolutePath = join(input.config.projectRoot, relPath)
        if (
          input.workspaces.some((workspace) => isWithinCodeRoot(absolutePath, workspace.codeRoot))
        ) {
          continue
        }
        discovered.set(relPath.replaceAll('\\', '/'), absolutePath)
      }
    }

    if (inspectionFailed) return null
    if (discovered.size !== indexed.size) return false
    const matches = await Promise.all(
      [...discovered].map(async ([configRelativePath, absolutePath]) => {
        const indexedHash = indexed.get(configRelativePath)
        if (indexedHash === undefined) return false
        const content = await readFile(resolve(absolutePath), 'utf8')
        return computeContentHash(content) === indexedHash
      }),
    )
    return matches.every(Boolean)
  } catch {
    return null
  }
}

/**
 * Returns whether a path belongs to a workspace code root.
 * @param filePath - Absolute file path to test.
 * @param codeRoot - Absolute workspace code root.
 * @returns True when the file is inside the workspace tree.
 */
function isWithinCodeRoot(filePath: string, codeRoot: string): boolean {
  const rel = relative(codeRoot, filePath).replaceAll('\\', '/')
  return rel === '' || (rel !== '..' && !rel.startsWith('../'))
}

/**
 * Produces deterministic machine-readable reasons for independent health dimensions.
 * @param input - Computed health dimensions.
 * @param input.stale - VCS reference staleness.
 * @param input.vcsRequired - Whether VCS evidence is applicable to this generation.
 * @param input.contentFresh - Working-tree freshness.
 * @param input.fingerprintMismatch - Derivation mismatch state.
 * @param input.coverageComplete - Coverage completeness state.
 * @param input.coverageReasons - Stable reasons from incomplete coverage facts.
 * @param input.contentInconsistent - Whether indexed coverage lacks a physical graph node.
 * @returns Ordered reason codes for non-fresh or unknown dimensions.
 */
function graphHealthReasonCodes(input: {
  readonly stale: boolean | null
  readonly vcsRequired: boolean
  readonly contentFresh: boolean | null
  readonly fingerprintMismatch: boolean | null
  readonly coverageComplete: boolean | null
  readonly coverageReasons: readonly string[]
  readonly contentInconsistent: boolean
}): readonly string[] {
  const reasons: string[] = []
  if (input.stale === true) reasons.push('VCS_REF_STALE')
  if (input.vcsRequired && input.stale === null) reasons.push('VCS_REF_UNKNOWN')
  if (input.contentFresh === false) reasons.push('CONTENT_DIRTY')
  if (input.contentFresh === null) reasons.push('CONTENT_UNKNOWN')
  if (input.fingerprintMismatch === true) reasons.push('DERIVATION_MISMATCH')
  if (input.fingerprintMismatch === null) reasons.push('DERIVATION_UNKNOWN')
  if (input.coverageComplete === false) reasons.push('COVERAGE_PARTIAL')
  if (input.coverageComplete === null) reasons.push('COVERAGE_UNKNOWN')
  if (input.contentInconsistent) reasons.push('GRAPH_CONTENT_INCONSISTENT')
  if (input.coverageComplete === false) reasons.push(...input.coverageReasons)
  return [...new Set(reasons)]
}
