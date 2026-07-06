import { type PersistedSpecMetadata } from '../../domain/services/parse-metadata.js'
import { type SpecRepository } from '../ports/spec-repository.js'
import { type SchemaProvider } from '../ports/schema-provider.js'
import { type ArtifactParserRegistry } from '../ports/artifact-parser.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'
import { type ContextWarning } from './_shared/context-warning.js'
import { WorkspaceNotFoundError } from '../errors/workspace-not-found-error.js'
import { SpecNotFoundError } from '../errors/spec-not-found-error.js'
import { type ContentHasher } from '../ports/content-hasher.js'
import { type ExtractorTransformRegistry } from '../../domain/services/content-extraction.js'
import { traverseDependsOn, type DependsOnFallback } from './_shared/depends-on-traversal.js'
import { type SpecWorkspaceRoute } from './_shared/spec-reference-resolver.js'
import { type ResolvedSpec } from './_shared/spec-pattern-matching.js'
import { type ListWorkspaces, type ProjectWorkspace } from './list-workspaces.js'

/** Valid section filter flags for spec context queries. */
export type SpecContextSectionFlag = 'rules' | 'constraints' | 'scenarios'

/** Input for the {@link GetSpecContext} use case. */
export interface GetSpecContextInput {
  /** The workspace name (e.g. `'default'`, `'billing'`). */
  readonly workspace: string
  /** The spec path within the workspace. */
  readonly specPath: SpecPath
  /** When `true`, follows `dependsOn` links transitively. */
  readonly followDeps?: boolean
  /** Limits dependency traversal depth. Only meaningful when `followDeps` is `true`. */
  readonly depth?: number
  /** Display mode used to shape entries. Defaults to `summary`. */
  readonly contextMode?: 'list' | 'summary' | 'full' | 'hybrid'
  /** When present, restricts output to the listed section types. */
  readonly sections?: ReadonlyArray<SpecContextSectionFlag>
  /** Whether to use LLM-optimized context when available. */
  readonly llmOptimizedContext?: boolean
}

/** A resolved spec entry in the context result. */
export interface SpecContextEntry {
  /** Display label for the spec (e.g. `'default:auth/login'`). */
  readonly spec: string
  /** Whether this entry is the root spec or a dependency. */
  readonly source: 'root' | 'dependency'
  /** Rendering shape for this entry. */
  readonly mode: 'list' | 'summary' | 'full'
  /** Spec title from metadata. */
  readonly title?: string
  /** Spec description from metadata. */
  readonly description?: string
  /** Extracted rules from metadata. */
  readonly rules?: ReadonlyArray<{ readonly requirement: string; readonly rules: string[] }>
  /** Extracted constraints from metadata. */
  readonly constraints?: readonly string[]
  /** Extracted scenarios from metadata. */
  readonly scenarios?: ReadonlyArray<{
    readonly requirement: string
    readonly name: string
    readonly given?: string[]
    readonly when?: string[]
    readonly then?: string[]
  }>
  /** Whether the metadata is stale or absent. */
  readonly stale: boolean
  /** Optional LLM-optimized content string, if present and enabled. */
  readonly optimizedContent?: string
}

/** Result returned by the {@link GetSpecContext} use case. */
export interface GetSpecContextResult {
  /** Resolved context entries for the spec and its dependencies. */
  readonly entries: readonly SpecContextEntry[]
  /** Advisory warnings encountered during resolution. */
  readonly warnings: readonly ContextWarning[]
}

/**
 * Use case that builds structured context entries for a single spec, optionally
 * following `dependsOn` links transitively.
 *
 * It uses the project orchestrator to discover repositories and checks metadata
 * freshness using SHA-256 content hashes. Dependency traversal uses DFS with
 * cycle detection.
 */
export class GetSpecContext {
  private readonly _listWorkspaces: ListWorkspaces
  private readonly _hasher: ContentHasher
  private readonly _schemaProvider: SchemaProvider | undefined
  private readonly _parsers: ArtifactParserRegistry | undefined
  private readonly _extractorTransforms: ExtractorTransformRegistry
  private readonly _workspaceRoutes: readonly SpecWorkspaceRoute[]

  /**
   * Creates a new `GetSpecContext` use case instance.
   *
   * @param listWorkspaces - The project orchestrator
   * @param hasher - Content hasher for metadata freshness checks
   * @param schemaProvider - Provider for schema-driven dependsOn fallback extraction
   * @param parsers - Registry of artifact parsers used for fallback extraction
   * @param extractorTransforms - Shared extractor transform registry
   * @param workspaceRoutes - Workspace routing metadata for cross-workspace resolution
   */
  constructor(
    listWorkspaces: ListWorkspaces,
    hasher: ContentHasher,
    schemaProvider?: SchemaProvider,
    parsers?: ArtifactParserRegistry,
    extractorTransforms: ExtractorTransformRegistry = new Map(),
    workspaceRoutes: readonly SpecWorkspaceRoute[] = [],
  ) {
    this._listWorkspaces = listWorkspaces
    this._hasher = hasher
    this._schemaProvider = schemaProvider
    this._parsers = parsers
    this._extractorTransforms = extractorTransforms
    this._workspaceRoutes = workspaceRoutes
  }

  /**
   * Executes the use case.
   *
   * @param input - Query parameters
   * @returns Structured context entries and warnings
   */
  async execute(input: GetSpecContextInput): Promise<GetSpecContextResult> {
    const mode: SpecContextEntry['mode'] =
      input.contextMode === undefined
        ? 'summary'
        : input.contextMode === 'hybrid'
          ? 'full'
          : input.contextMode

    const warnings: ContextWarning[] = []
    const entries: SpecContextEntry[] = []

    const workspaces = await this._listWorkspaces.execute()
    const workspaceMap = new Map(workspaces.map((ws) => [ws.name, ws]))

    const ws = workspaceMap.get(input.workspace)
    if (ws === undefined) {
      throw new WorkspaceNotFoundError(input.workspace)
    }

    const repo = ws.specRepo
    const spec = await repo.get(input.specPath)
    if (spec === null) {
      throw new SpecNotFoundError(`${input.workspace}:${input.specPath.toString()}`)
    }

    const rootLabel = `${input.workspace}:${input.specPath.toString()}`
    const metadata = await repo.metadata(spec)
    entries.push(
      this._buildEntry(
        rootLabel,
        'root',
        mode,
        repo,
        spec,
        metadata,
        input.sections,
        warnings,
        input.llmOptimizedContext,
      ),
    )

    if (input.followDeps) {
      const includedSpecs = new Map<string, ResolvedSpec>([
        [rootLabel, { workspace: input.workspace, capPath: input.specPath.toString() }],
      ])
      const dependsOnAdded = new Map<string, ResolvedSpec>()
      await traverseDependsOn(
        input.workspace,
        input.specPath.toString(),
        includedSpecs,
        dependsOnAdded,
        new Set<string>(),
        new Set<string>(),
        workspaceMap,
        warnings,
        input.depth,
        0,
        await this._buildDependsOnFallback(),
      )

      for (const [specLabel, resolved] of dependsOnAdded) {
        if (specLabel === rootLabel) continue

        const depEntry = await this._buildDependencyEntry(
          resolved,
          workspaceMap,
          warnings,
          mode,
          input.sections,
          input.llmOptimizedContext,
        )
        if (depEntry !== null) {
          entries.push(depEntry)
        }
      }
    }

    return { entries, warnings }
  }

  /**
   * Builds a context entry from a spec's metadata.
   *
   * @param specLabel - Display label for the spec
   * @param source - Whether this spec is the root or a dependency
   * @param mode - Context display mode for the entry
   * @param repo - Repository for artifact content resolution
   * @param spec - The spec entity
   * @param metadata - Parsed metadata, or `null` if absent
   * @param sections - Optional section filter flags
   * @param warnings - Mutable array to collect warnings
   * @param llmOptimizedContext - Whether to prefer optimized content
   * @returns The constructed context entry
   */
  private _buildEntry(
    specLabel: string,
    source: 'root' | 'dependency',
    mode: SpecContextEntry['mode'],
    repo: SpecRepository,
    spec: import('../../domain/entities/spec.js').Spec,
    metadata: PersistedSpecMetadata | null,
    sections: ReadonlyArray<SpecContextSectionFlag> | undefined,
    warnings: ContextWarning[],
    llmOptimizedContext = false,
  ): SpecContextEntry {
    if (mode === 'list') {
      return { spec: specLabel, source, mode, stale: metadata === null }
    }

    if (metadata !== null) {
      if (metadata.freshness === 'stale') {
        warnings.push({
          type: 'stale-metadata',
          path: specLabel,
          message: `Metadata for '${specLabel}' is stale`,
        })
      }

      if (llmOptimizedContext) {
        if (metadata.optimizedContext === undefined || metadata.optimizedContext === '') {
          warnings.push({
            type: 'stale-optimization',
            path: specLabel,
            message: `Spec '${specLabel}' is missing LLM-optimized context. Launch specd-spec-context-optimizer agent to refresh.`,
          })
        }
      }

      if (metadata.freshness === 'fresh') {
        if (mode === 'summary') {
          return {
            spec: specLabel,
            source,
            mode,
            stale: false,
            ...(metadata.title !== undefined ? { title: metadata.title } : {}),
            ...(metadata.description !== undefined ? { description: metadata.description } : {}),
          }
        }

        // Full mode: Title and Description are always included.
        // If no sections are provided, default to Rules + Constraints.
        const effectiveSections =
          sections === undefined || sections.length === 0
            ? (['rules', 'constraints'] as const)
            : sections

        const hasRules = effectiveSections.includes('rules')
        const hasConstraints = effectiveSections.includes('constraints')
        const hasScenarios = effectiveSections.includes('scenarios')

        const useOptimized =
          llmOptimizedContext &&
          metadata.optimizedContext !== undefined &&
          metadata.optimizedContext !== '' &&
          hasRules &&
          hasConstraints

        return {
          spec: specLabel,
          source,
          mode,
          stale: false,
          ...(metadata.title !== undefined ? { title: metadata.title } : {}),
          ...(metadata.description !== undefined
            ? {
                description:
                  (llmOptimizedContext && metadata.optimizedDescription) || metadata.description,
              }
            : {}),
          ...(useOptimized ? { optimizedContent: metadata.optimizedContext } : {}),
          ...(!useOptimized && hasRules && metadata.rules !== undefined && metadata.rules.length > 0
            ? { rules: metadata.rules }
            : {}),
          ...(!useOptimized &&
          hasConstraints &&
          metadata.constraints !== undefined &&
          metadata.constraints.length > 0
            ? { constraints: metadata.constraints }
            : {}),
          ...(hasScenarios && metadata.scenarios !== undefined && metadata.scenarios.length > 0
            ? { scenarios: metadata.scenarios }
            : {}),
        }
      }

      if (mode === 'summary') {
        return {
          spec: specLabel,
          source,
          mode,
          stale: true,
          ...(metadata.title !== undefined ? { title: metadata.title } : {}),
          ...(metadata.description !== undefined ? { description: metadata.description } : {}),
        }
      }

      return {
        spec: specLabel,
        source,
        mode,
        stale: true,
        ...(metadata.title !== undefined ? { title: metadata.title } : {}),
        ...(metadata.description !== undefined ? { description: metadata.description } : {}),
      }
    }

    return { spec: specLabel, source, mode, stale: true }
  }

  /**
   * Builds one dependency entry from a resolved spec reference.
   *
   * @param resolved - Dependency spec identity
   * @param workspaceMap - Orchestrated workspace map
   * @param warnings - Mutable array to collect warnings
   * @param mode - Context display mode for entries
   * @param sections - Optional section filter flags
   * @param llmOptimizedContext - Whether to prefer optimized content
   * @returns Built entry or `null` when the dependency cannot be resolved
   */
  private async _buildDependencyEntry(
    resolved: ResolvedSpec,
    workspaceMap: Map<string, ProjectWorkspace>,
    warnings: ContextWarning[],
    mode: SpecContextEntry['mode'],
    sections: ReadonlyArray<SpecContextSectionFlag> | undefined,
    llmOptimizedContext = false,
  ): Promise<SpecContextEntry | null> {
    const depLabel = `${resolved.workspace}:${resolved.capPath}`
    const ws = workspaceMap.get(resolved.workspace)
    if (ws === undefined) {
      warnings.push({
        type: 'unknown-workspace',
        path: resolved.workspace,
        message: `Dependency workspace '${resolved.workspace}' not found`,
      })
      return null
    }

    const repo = ws.specRepo
    const depSpec = await repo.get(SpecPath.parse(resolved.capPath))
    if (depSpec === null) {
      warnings.push({
        type: 'missing-spec',
        path: depLabel,
        message: `Dependency '${depLabel}' not found`,
      })
      return null
    }

    const depMetadata = await repo.metadata(depSpec)
    return this._buildEntry(
      depLabel,
      'dependency',
      mode,
      repo,
      depSpec,
      depMetadata,
      sections,
      warnings,
      llmOptimizedContext,
    )
  }

  /**
   * Builds optional fallback extraction config for dependency traversal.
   *
   * @returns Shared fallback config when schema extraction is available
   */
  private async _buildDependsOnFallback(): Promise<DependsOnFallback | undefined> {
    if (this._schemaProvider === undefined || this._parsers === undefined) {
      return undefined
    }

    const schema = await this._schemaProvider.get()
    const extraction = schema.metadataExtraction()
    if (extraction === undefined) {
      return undefined
    }

    return {
      extraction,
      schemaArtifacts: schema.artifacts(),
      parsers: this._parsers,
      extractorTransforms: this._extractorTransforms,
      workspaceRoutes: this._workspaceRoutes,
    }
  }
}
