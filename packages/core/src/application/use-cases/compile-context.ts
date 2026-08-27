import { type SpecMetadata } from '../../domain/services/parse-metadata.js'
import { ChangeNotFoundError } from '../errors/change-not-found-error.js'
import { SchemaMismatchError } from '../errors/schema-mismatch-error.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type SpecRepository } from '../ports/spec-repository.js'
import { type SchemaProvider } from '../ports/schema-provider.js'
import { type FileReader } from '../ports/file-reader.js'
import { type ArtifactParserRegistry } from '../ports/artifact-parser.js'
import { type ExtractorTransformRegistry } from '../../domain/services/content-extraction.js'
import { Spec, ABSENT_SPEC_SIDECAR } from '../../domain/entities/spec.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'
import { Schema } from '../../domain/value-objects/schema.js'
import { inferFormat } from '../../domain/services/format-inference.js'
import { parseSpecId } from '../../domain/services/parse-spec-id.js'
import { checkProjectMetadataFreshness } from './_shared/project-metadata-freshness.js'
import { type ContentHasher } from '../ports/content-hasher.js'
import { type PreviewSpec } from './preview-spec.js'
import { type ContextWarning } from './_shared/context-warning.js'
import { type ResolvedSpec } from './_shared/spec-pattern-matching.js'
import { resolveConfiguredContextSpecs } from './_shared/resolve-configured-context-specs.js'
import { traverseDependsOn, type DependsOnFallback } from './_shared/depends-on-traversal.js'
import { compileContextFingerprint } from './_shared/compile-context-fingerprint.js'
import { type SpecWorkspaceRoute } from './_shared/spec-reference-resolver.js'
import { extractMetadataFromSpecArtifacts } from './_shared/extract-metadata-from-spec-artifacts.js'
import { type ListWorkspaces, type ProjectWorkspace } from './list-workspaces.js'
import { type GetSpecMetadata } from './get-spec-metadata.js'
import {
  appendMaterializationDiagnostics,
  materializeContextSpecMetadata,
} from './_shared/materialize-context-spec-metadata.js'
import { mergeCompileContextRuntimeOverrides } from './_shared/merge-compile-context-config.js'

const CONTEXT_SOURCE_PRIORITY: Record<ContextSpecSource, number> = {
  includePattern: 0,
  dependsOnTraversal: 1,
  specDependsOn: 2,
  specIds: 3,
}

/** Ordered schema artifact descriptor used to resolve displayable spec files. */
interface SpecArtifactDescriptor {
  readonly artifactId: string
  readonly filename: string
  readonly format: string
}

/** A resolved spec-scoped file ready for rendering or metadata extraction. */
interface SpecContentFile {
  readonly artifactId: string
  readonly filename: string
  readonly content: string
  readonly format: string
}

export { type ContextWarning } from './_shared/context-warning.js'

/** A single entry in the project-level `context:` list. */
export type ContextEntry = { id?: string; instruction: string } | { id?: string; file: string }

/** Per-workspace configuration for context spec selection. */
export interface WorkspaceContextConfig {
  /** Include patterns evaluated only when this workspace is active. */
  readonly contextIncludeSpecs?: string[]
  /** Exclude patterns evaluated only when this workspace is active. */
  readonly contextExcludeSpecs?: string[]
}

/** Project configuration subset used by `CompileContext`. */
export interface CompileContextConfig {
  /** Absolute path to the directory containing the active `specd.yaml`. */
  readonly projectRoot?: string
  /** Absolute path to the specd-owned config root. */
  readonly configPath?: string
  /** Ordered list of project-level context entries injected verbatim at the top. */
  readonly context?: ContextEntry[]
  /** Project-level include patterns; always applied regardless of active workspace. */
  readonly contextIncludeSpecs?: string[]
  /** Project-level exclude patterns; always applied regardless of active workspace. */
  readonly contextExcludeSpecs?: string[]
  /**
   * Controls how specs are rendered in the result.
   *
   * - `'list'` — all entries are list-only.
   * - `'summary'` (default) — all entries are summary-only.
   * - `'full'` — all entries include full content.
   * - `'hybrid'` — direct change specs included via `includeChangeSpecs` are full, others summary.
   */
  readonly contextMode?: 'list' | 'summary' | 'full' | 'hybrid'
  /** Per-workspace context include/exclude patterns. */
  readonly workspaces?: Record<string, WorkspaceContextConfig>
  /** When `true`, specd may prefer LLM-optimized context when available. */
  readonly llmOptimizedContext?: boolean | undefined
}

/** Metadata section names that can be individually selected for output. */
export type SpecSection = 'rules' | 'constraints' | 'scenarios'

/** Input for the {@link CompileContext} use case. */
export interface CompileContextInput {
  /** The change name to compile context for. */
  readonly name: string
  /** The lifecycle step being entered (e.g. `'designing'`, `'implementing'`). */
  readonly step: string
  /**
   * Runtime override for display mode.
   * When absent, the construction-time yaml default is used.
   */
  readonly contextMode?: CompileContextConfig['contextMode']
  /**
   * Runtime override for whether optimized context is preferred.
   * When absent, the construction-time yaml default is used.
   */
  readonly llmOptimizedContext?: boolean
  /**
   * When `true`, directly seeds `change.specIds` into the collected set.
   * When `false` or absent, direct `specIds` seeding is skipped.
   */
  readonly includeChangeSpecs?: boolean
  /**
   * When `true`, performs the `dependsOn` transitive traversal (step 5) to discover
   * additional specs. When `false` or absent, step 5 is skipped entirely.
   */
  readonly followDeps?: boolean
  /**
   * Limits `dependsOn` traversal depth. Only meaningful when `followDeps` is `true`.
   * `1` = direct dependencies only; `2` = deps of deps; absent = unlimited.
   */
  readonly depth?: number
  /**
   * When present, restricts the metadata sections rendered per full-mode spec to the listed values.
   * When absent, all sections are rendered (description + rules + constraints + scenarios).
   * Does not affect summary-mode specs, project context entries, or available steps.
   */
  readonly sections?: ReadonlyArray<SpecSection>
  /**
   * When provided, the use case compares this value against the calculated context fingerprint.
   * If they match, the result's `status` is `'unchanged'` and context content is omitted.
   * If omitted or the fingerprint does not match, `status` is `'changed'` and full context is returned.
   */
  readonly fingerprint?: string
}

/** A structured project context entry in the result. */
export interface ProjectContextEntry {
  /** The type of context entry. */
  readonly source: 'instruction' | 'file'
  /** The file path (only for `file` entries). */
  readonly path?: string
  /** The rendered text content. */
  readonly content: string
}

/** How a spec was collected into the context. Priority: specIds > specDependsOn > dependsOnTraversal > includePattern. */
export type ContextSpecSource =
  | 'specIds'
  | 'specDependsOn'
  | 'includePattern'
  | 'dependsOnTraversal'

/** A spec entry in the compiled context result. */
export interface ContextSpecEntry {
  /** Fully-qualified spec ID (e.g. `core:core/compile-context`). */
  readonly specId: string
  /** The spec title from metadata or heading extraction (summary/full modes). */
  readonly title?: string
  /** The spec description from metadata (summary/full modes). */
  readonly description?: string
  /** How this spec was collected. */
  readonly source: ContextSpecSource
  /** Rendering shape for this entry. */
  readonly mode: 'list' | 'summary' | 'full'
  /** Rendered spec content (present only when `mode` is `'full'`). */
  readonly content?: string
}

/** Result returned by a successful {@link CompileContext} execution. */
export interface CompileContextResult {
  /** The calculated fingerprint for the current context state. */
  readonly contextFingerprint: string
  /** Whether the full context was returned (`'changed'`) or fingerprint matched (`'unchanged'`). */
  readonly status: 'changed' | 'unchanged'
  /** Rendered project context entries. */
  readonly projectContext: readonly ProjectContextEntry[]
  /** Spec entries with display mode, source, and content. */
  readonly specs: readonly ContextSpecEntry[]
  /** Stale metadata warnings and other advisory conditions. */
  readonly warnings: readonly ContextWarning[]
}

/**
 * Assembles the structured context an AI agent receives when entering a lifecycle step.
 *
 * Collects context specs via five-step include/exclude/dependsOn resolution and
 * returns structured project context entries and spec entries (with display-mode
 * classification). Artifact
 * instructions and step hook instructions are separate concerns handled by
 * `GetArtifactInstruction` and `GetHookInstructions` respectively.
 */
export class CompileContext {
  private readonly _changes: ChangeRepository
  private readonly _listWorkspaces: ListWorkspaces
  private readonly _schemaProvider: SchemaProvider
  private readonly _files: FileReader
  private readonly _parsers: ArtifactParserRegistry
  private readonly _hasher: ContentHasher
  private readonly _previewSpec: PreviewSpec
  private readonly _extractorTransforms: ExtractorTransformRegistry
  private readonly _workspaceRoutes: readonly SpecWorkspaceRoute[]
  private readonly _defaultConfig: CompileContextConfig
  private readonly _getMetadata: GetSpecMetadata

  /**
   * Creates a new `CompileContext` use case instance.
   *
   * @param changes - Repository for loading the change
   * @param listWorkspaces - The project orchestrator
   * @param schemaProvider - Provider for the fully-resolved schema
   * @param files - Reader for project-level context file entries
   * @param parsers - Registry of artifact format parsers
   * @param hasher - Content hasher for metadata freshness checks
   * @param previewSpec - Use case for merging deltas into spec content
   * @param getMetadata - Metadata materialization use case
   * @param extractorTransforms - Shared extractor transform registry
   * @param workspaceRoutes - Workspace routing metadata for cross-workspace resolution
   * @param defaultConfig - Yaml-derived context configuration baked at composition time
   */
  constructor(
    changes: ChangeRepository,
    listWorkspaces: ListWorkspaces,
    schemaProvider: SchemaProvider,
    files: FileReader,
    parsers: ArtifactParserRegistry,
    hasher: ContentHasher,
    previewSpec: PreviewSpec,
    getMetadata: GetSpecMetadata,
    extractorTransforms: ExtractorTransformRegistry = new Map(),
    workspaceRoutes: readonly SpecWorkspaceRoute[] = [],
    defaultConfig: CompileContextConfig = {},
  ) {
    this._changes = changes
    this._listWorkspaces = listWorkspaces
    this._schemaProvider = schemaProvider
    this._files = files
    this._parsers = parsers
    this._hasher = hasher
    this._previewSpec = previewSpec
    this._getMetadata = getMetadata
    this._extractorTransforms = extractorTransforms
    this._workspaceRoutes = workspaceRoutes
    this._defaultConfig = defaultConfig
  }

  /**
   * Compiles the structured context for the given lifecycle step.
   *
   * @param input - Context compilation parameters
   * @returns Structured context result with spec entries, project context, and warnings
   * @throws {ChangeNotFoundError} If no change with the given name exists
   * @throws {SchemaNotFoundError} If the schema reference cannot be resolved
   */
  async execute(input: CompileContextInput): Promise<CompileContextResult> {
    const config = mergeCompileContextRuntimeOverrides(this._defaultConfig, {
      ...(input.contextMode !== undefined ? { contextMode: input.contextMode } : {}),
      ...(input.llmOptimizedContext !== undefined
        ? { llmOptimizedContext: input.llmOptimizedContext }
        : {}),
    })

    const change = await this._changes.get(input.name)
    if (change === null) throw new ChangeNotFoundError(input.name)

    const schema = await this._schemaProvider.get()

    // --- Schema name guard ---
    if (schema.name() !== change.schemaName) {
      throw new SchemaMismatchError(change.name, change.schemaName, schema.name())
    }

    const warnings: ContextWarning[] = []

    const workspaces = await this._listWorkspaces.execute()
    const workspaceMap = new Map(workspaces.map((ws) => [ws.name, ws]))

    // --- Step 0: Cache Verification for LLM-optimized project context ---
    const {
      metadata: projectMeta,
      isFresh,
      warnings: optimizationWarnings,
    } = await checkProjectMetadataFreshness(
      config,
      this._files,
      this._hasher,
      workspaceMap,
      this._getMetadata,
    )

    const shouldUseOptimizedContext =
      config.llmOptimizedContext === true &&
      (input.sections === undefined ||
        (input.sections.includes('rules') && input.sections.includes('constraints')))

    warnings.push(...optimizationWarnings)

    // Only use optimized project context if it's fresh AND none of the specs in it are being modified in this change.
    let useOptimizedProjectContext = false
    if (isFresh && projectMeta && shouldUseOptimizedContext) {
      const optimizedSpecIds = new Set(projectMeta.freshness.inputs.specMetadata.map((s) => s.id))
      const changeSpecIds = new Set(change.specIds)
      const hasOverlap = [...optimizedSpecIds].some((id) => changeSpecIds.has(id))

      if (!hasOverlap) {
        useOptimizedProjectContext = true
      }
    }

    // --- Source tracking: build seed sets for collection and source classification ---
    const includeChangeSpecs = input.includeChangeSpecs === true
    const specIdsSet = new Set(change.specIds)
    const specDependsOnSet = new Set<string>()
    const sourceMap = new Map<string, ContextSpecSource>()
    const collectedSpecs = new Map<string, ResolvedSpec>()
    const protectedKeys = new Set<string>()

    const registerCollectedSpec = (
      spec: ResolvedSpec,
      source: ContextSpecSource,
      opts: { protect?: boolean } = {},
    ): void => {
      const key = `${spec.workspace}:${spec.capPath}`
      if (!collectedSpecs.has(key)) {
        collectedSpecs.set(key, spec)
      }

      const existingSource = sourceMap.get(key)
      if (
        existingSource === undefined ||
        CONTEXT_SOURCE_PRIORITY[source] > CONTEXT_SOURCE_PRIORITY[existingSource]
      ) {
        sourceMap.set(key, source)
      }

      if (opts.protect === true) protectedKeys.add(key)
    }

    if (includeChangeSpecs) {
      for (const specId of change.specIds) {
        const { workspace, capPath } = parseSpecId(specId)
        registerCollectedSpec({ workspace, capPath }, 'specIds', { protect: true })
      }
    }

    for (const deps of change.specDependsOn.values()) {
      for (const dep of deps) {
        if (specDependsOnSet.has(dep)) continue
        specDependsOnSet.add(dep)
        const { workspace, capPath } = parseSpecId(dep)
        registerCollectedSpec({ workspace, capPath }, 'specDependsOn')
      }
    }

    const activeWorkspaces = new Set(change.workspaces)

    // --- 5-step context spec collection ---
    await resolveConfiguredContextSpecs({
      config: useOptimizedProjectContext
        ? { ...config, contextIncludeSpecs: [], contextExcludeSpecs: [] }
        : config,
      activeWorkspaces,
      workspaceMap,
      warnings,
      collector: {
        include: (spec) => registerCollectedSpec(spec, 'includePattern'),
        exclude: (spec) => {
          const key = `${spec.workspace}:${spec.capPath}`
          if (!protectedKeys.has(key)) collectedSpecs.delete(key)
        },
      },
    })

    // Step 5: dependsOn traversal from change.specIds (only when followDeps is true)
    const dependsOnAdded = new Map<string, ResolvedSpec>()
    if (input.followDeps === true) {
      const extraction = schema.metadataExtraction()
      const depFallback: DependsOnFallback | undefined =
        extraction !== undefined
          ? {
              extraction,
              schemaArtifacts: schema.artifacts(),
              parsers: this._parsers,
              extractorTransforms: this._extractorTransforms,
              workspaceRoutes: this._workspaceRoutes,
            }
          : undefined

      const depSeen = new Set<string>()
      for (const specId of change.specIds) {
        const { workspace, capPath } = parseSpecId(specId)
        const ws = workspaceMap.get(workspace)
        if (ws === undefined) continue
        const repo = ws.specRepo
        let specPathObj: SpecPath
        try {
          specPathObj = SpecPath.parse(capPath)
        } catch {
          continue
        }

        // Tier 1: manifest-declared deps — no repository access, so deps
        // declared for non-persisted change-scoped specs still traverse.
        let dependsOnList: string[] | undefined

        const manifestDeps = change.specDependsOn.get(specId)
        if (manifestDeps !== undefined && manifestDeps.length > 0) {
          dependsOnList = [...manifestDeps]
        } else {
          const spec = await repo.get(specPathObj)
          if (!spec) continue

          try {
            const materialized = await this._getMetadata.execute({ specId })
            appendMaterializationDiagnostics(specId, materialized, warnings)
            dependsOnList = materialized.metadata.dependsOn
          } catch {
            warnings.push({
              type: 'missing-metadata',
              path: specId,
              message: `No metadata for '${specId}' — dependency traversal may be incomplete.`,
            })

            if (depFallback !== undefined && depFallback.extraction.dependsOn !== undefined) {
              // Change-scoped specs extract from their merged preview set; all
              // other specs fall back to base persisted artifacts.
              let mergedForDep: SpecContentFile[] | undefined
              try {
                const preview = await this._previewSpec.execute({ name: input.name, specId })
                if (preview.files.length > 0) {
                  const descriptorsByFilename = new Map(
                    schema
                      .artifacts()
                      .filter((artifactType) => artifactType.scope === 'spec')
                      .map((artifactType) => [
                        artifactType.output.split('/').pop()!,
                        {
                          artifactId: artifactType.id,
                          format:
                            artifactType.format ??
                            inferFormat(artifactType.output.split('/').pop()!) ??
                            'plaintext',
                        },
                      ]),
                  )
                  mergedForDep = preview.files.flatMap((file) => {
                    const descriptor = descriptorsByFilename.get(file.filename)
                    if (descriptor === undefined) return []
                    return [
                      {
                        artifactId: descriptor.artifactId,
                        filename: file.filename,
                        content: file.merged,
                        format: descriptor.format,
                      },
                    ]
                  })
                }
              } catch {
                mergedForDep = undefined
              }
              dependsOnList = await this._extractDependsOnFallback(
                repo,
                spec,
                workspaceMap,
                depFallback,
                mergedForDep,
              )
            }
          }
        }

        if (dependsOnList !== undefined) {
          for (const dep of dependsOnList) {
            const { workspace: dw, capPath: dp } = parseSpecId(dep)
            await traverseDependsOn(
              dw,
              dp,
              collectedSpecs,
              dependsOnAdded,
              depSeen,
              new Set<string>(),
              workspaceMap,
              warnings,
              input.depth,
              0,
              depFallback,
              { unresolved: 'skip' },
            )
          }
        }
      }

      // Tag dependsOn discoveries — dependsOnTraversal has higher priority than includePattern
      for (const [, spec] of dependsOnAdded) {
        registerCollectedSpec(spec, 'dependsOnTraversal')
      }
    }

    const allSpecs: ResolvedSpec[] = [...collectedSpecs.values()]

    // --- Display mode classification ---
    const contextMode: 'list' | 'summary' | 'full' | 'hybrid' = config.contextMode ?? 'summary'

    // --- Part 1: Project context entries ---
    const projectContext: ProjectContextEntry[] = []

    if (useOptimizedProjectContext && projectMeta) {
      projectContext.push({ source: 'instruction', content: projectMeta.optimized.context })
    } else {
      for (const entry of config.context ?? []) {
        if ('instruction' in entry) {
          projectContext.push({ source: 'instruction', content: entry.instruction })
        } else {
          const content = await this._files.read(entry.file)
          if (content === null) {
            warnings.push({
              type: 'missing-file',
              path: entry.file,
              message: `Context file '${entry.file}' not found`,
            })
          } else {
            projectContext.push({ source: 'file', path: entry.file, content })
          }
        }
      }
    }

    // --- Part 2: Spec entries ---
    const specArtifactDescriptors = this._listSpecArtifactDescriptors(schema)
    const sectionsFilter =
      input.sections ??
      (input.step === 'verifying' || input.step === 'done'
        ? (['rules', 'constraints', 'scenarios'] as const)
        : (['rules', 'constraints'] as const))
    const specs: ContextSpecEntry[] = []
    for (const { workspace, capPath } of allSpecs) {
      const ws = workspaceMap.get(workspace)
      if (ws === undefined) continue
      const specRepo = ws.specRepo

      let specPathObj: SpecPath
      try {
        specPathObj = SpecPath.parse(capPath)
      } catch {
        continue
      }

      const spec = new Spec(workspace, specPathObj, [], ABSENT_SPEC_SIDECAR, ABSENT_SPEC_SIDECAR)
      const specId = `${workspace}:${capPath}`
      const source = sourceMap.get(specId) ?? 'includePattern'

      // Determine entry mode from configured context mode and source.
      const mode: ContextSpecEntry['mode'] = (() => {
        switch (contextMode) {
          case 'list':
            return 'list'
          case 'summary':
            return 'summary'
          case 'full':
            return 'full'
          case 'hybrid':
            return source === 'specIds' ? 'full' : 'summary'
          default:
            return 'summary'
        }
      })()

      if (mode === 'list') {
        specs.push({ specId, source, mode })
        continue
      }

      const isScoped = specIdsSet.has(specId)

      // Extracted-first: preview merge is the primary source for scoped specs.
      let baseFiles: SpecContentFile[] | undefined
      let mergedFiles: SpecContentFile[] | undefined
      if (isScoped) {
        try {
          const preview = await this._previewSpec.execute({
            name: input.name,
            specId,
          })
          for (const w of preview.warnings) {
            warnings.push({ type: 'preview', path: specId, message: w })
          }
          if (preview.files.length > 0) {
            baseFiles = await this._loadBaseSpecFiles(specRepo, spec, specArtifactDescriptors)
            mergedFiles = this._mergePreviewFiles(preview.files, baseFiles, specArtifactDescriptors)
          }
        } catch {
          warnings.push({
            type: 'preview',
            path: specId,
            message: `PreviewSpec failed for '${specId}' — falling back to base content`,
          })
        }
      }

      /** A candidate field/content set produced by one ladder rung. */
      interface LadderView {
        readonly title: string
        readonly description: string
        readonly content?: string | undefined
      }
      /**
       * Determines whether a ladder rung produced enough data to render an entry.
       *
       * @param view - Candidate view from the current rung
       * @returns Whether any field carries usable content
       */
      const usable = (view: LadderView | undefined): boolean =>
        view !== undefined &&
        (view.title !== '' || view.description !== '' || (view.content ?? '') !== '')

      let view: LadderView | undefined

      // Rung 1: schema-driven extraction over the merged artifact set.
      if (mergedFiles !== undefined) {
        const extraction = schema.metadataExtraction()
        if (extraction !== undefined) {
          const repositories = new Map<string, SpecRepository>()
          for (const wsEntry of workspaceMap.values()) {
            repositories.set(wsEntry.name, wsEntry.specRepo)
          }
          const extracted = await extractMetadataFromSpecArtifacts({
            effectiveSpecSchema: schema,
            workspace,
            specPath: SpecPath.parse(capPath),
            artifacts: mergedFiles,
            parsers: this._parsers,
            extractorTransforms: this._extractorTransforms,
            repositories,
            workspaceRoutes: this._workspaceRoutes,
          })
          const rungTitle =
            (extracted.metadata.title ?? '') !== ''
              ? (extracted.metadata.title ?? '')
              : this._extractTitleFromFiles(mergedFiles)
          view = {
            title: rungTitle,
            description: extracted.metadata.description ?? '',
            content:
              mode === 'summary'
                ? undefined
                : this._renderFromMetadata(extracted.metadata, sectionsFilter, false),
          }
        }
      }

      // Rung 2: canonical projection — the primary path for non-scoped specs.
      let metadata: SpecMetadata | null = null
      if (!usable(view)) {
        try {
          metadata = await materializeContextSpecMetadata(this._getMetadata, specId, warnings)
        } catch {
          metadata = null
        }
        if (metadata !== null) {
          const llmFlag = isScoped ? false : shouldUseOptimizedContext
          view = {
            title: metadata.title ?? '',
            description: (llmFlag && metadata.optimizedDescription) || metadata.description || '',
            content:
              mode === 'summary'
                ? undefined
                : this._renderFromMetadata(metadata, sectionsFilter, llmFlag),
          }
        }
      }

      // Rung 3: extraction over base persisted artifacts (scoped only).
      if (isScoped && !usable(view)) {
        const displayFiles =
          mergedFiles ??
          (baseFiles ??= await this._loadBaseSpecFiles(specRepo, spec, specArtifactDescriptors))
        const extraction = schema.metadataExtraction()
        if (extraction !== undefined) {
          const fallbackContent = await this._renderExtractedSectionsFromFiles(
            schema,
            displayFiles,
            workspace,
            capPath,
            workspaceMap,
            sectionsFilter,
            false,
          )
          view = {
            title: this._extractTitleFromFiles(displayFiles),
            description: '',
            content: mode === 'summary' ? undefined : fallbackContent,
          }
        }
      }

      // All rungs exhausted — warn once and emit a minimal entry.
      const finalView: LadderView = view ?? {
        title: this._extractTitleFromFiles(
          baseFiles ?? (await this._loadBaseSpecFiles(specRepo, spec, specArtifactDescriptors)),
        ),
        description: '',
        content: mode === 'summary' ? undefined : '',
      }
      if (!usable(finalView)) {
        warnings.push({
          type: 'missing-metadata',
          path: specId,
          message: `No metadata for '${specId}' — falling back to extracted sections`,
        })
      }

      // Optimization warnings — non-scoped only, typed via lock baselines.
      if (
        shouldUseOptimizedContext &&
        !isScoped &&
        metadata !== null &&
        (metadata.optimizedContext === undefined || metadata.optimizedContext === '')
      ) {
        const status = metadata.optimizationStatus?.optimizedContext ?? 'missing'
        const warningType = status === 'stale' ? 'stale-optimization' : 'missing-optimization'
        warnings.push({
          type: warningType,
          path: specId,
          message:
            status === 'stale'
              ? `Spec '${specId}' drifted since its last LLM-optimization. Launch specd-spec-context-optimizer agent to refresh.`
              : `Spec '${specId}' has never been LLM-optimized. Launch specd-spec-context-optimizer agent to refresh.`,
        })
      }

      specs.push({
        specId,
        title: finalView.title,
        description: finalView.description,
        source,
        mode,
        ...(finalView.content !== undefined ? { content: finalView.content } : {}),
      })
    }

    // --- Calculate fingerprint (after all fields are ready) ---
    const fingerprintSections: readonly SpecSection[] =
      sectionsFilter !== undefined && specs.some((entry) => entry.mode === 'full')
        ? sectionsFilter
        : []

    const currentFingerprint = compileContextFingerprint({
      contextMode,
      includeChangeSpecs,
      followDeps: input.followDeps === true,
      ...(input.depth !== undefined ? { depth: input.depth } : {}),
      sections: fingerprintSections,
      projectContext,
      specs,
      warnings,
    })

    // If fingerprint matches, omit context content but keep everything else
    if (input.fingerprint !== undefined && input.fingerprint === currentFingerprint) {
      return {
        contextFingerprint: currentFingerprint,
        status: 'unchanged',
        projectContext: [],
        specs: [],
        warnings,
      }
    }

    return {
      contextFingerprint: currentFingerprint,
      status: 'changed',
      projectContext,
      specs,
      warnings,
    }
  }

  /**
   * Renders spec content from fresh metadata into a single string.
   *
   * @param metadata - The fresh parsed metadata
   * @param sectionsFilter - Optional filter to include only specific sections
   * @param llmOptimizedContext - Whether to prefer optimized fields
   * @returns Rendered content string
   */
  private _renderFromMetadata(
    metadata: SpecMetadata,
    sectionsFilter: ReadonlyArray<SpecSection>,
    llmOptimizedContext = false,
  ): string {
    const metaParts: string[] = []

    // Description is always included in full mode as part of the content string
    // if it exists in metadata (header persistence).
    const description =
      (llmOptimizedContext && metadata.optimizedDescription) || metadata.description
    if (description !== undefined && description !== '') {
      metaParts.push(`**Description:** ${description}`)
    }

    const hasRules = sectionsFilter.includes('rules')
    const hasConstraints = sectionsFilter.includes('constraints')
    const hasScenarios = sectionsFilter.includes('scenarios')

    const useOptimized =
      llmOptimizedContext &&
      metadata.optimizedContext !== undefined &&
      metadata.optimizedContext !== '' &&
      hasRules &&
      hasConstraints

    if (useOptimized) {
      metaParts.push(metadata.optimizedContext)
    } else {
      if (hasRules && metadata.rules?.length) {
        const rulesText = metadata.rules
          .map((r) => `##### ${r.requirement}\n${r.rules.map((rule) => `- ${rule}`).join('\n')}`)
          .join('\n\n')
        metaParts.push(`#### Rules\n\n${rulesText}`)
      }
      if (hasConstraints && metadata.constraints?.length) {
        const constraintsText = metadata.constraints.map((c) => `- ${c}`).join('\n')
        metaParts.push(`#### Constraints\n\n${constraintsText}`)
      }
    }

    if (hasScenarios && metadata.scenarios?.length) {
      const scenariosText = metadata.scenarios
        .map((s) => {
          const lines: string[] = [`##### Scenario: ${s.name}`, `*Requirement: ${s.requirement}*`]
          if (s.given?.length) lines.push(`**Given:** ${s.given.join('; ')}`)
          if (s.when?.length) lines.push(`**When:** ${s.when.join('; ')}`)
          if (s.then?.length) lines.push(`**Then:** ${s.then.join('; ')}`)
          return lines.join('\n')
        })
        .join('\n\n')
      metaParts.push(`#### Scenarios\n\n${scenariosText}`)
    }

    return metaParts.join('\n\n')
  }

  /**
   * Returns schema artifact descriptors for all spec-scoped artifacts in display order.
   *
   * `spec.md` is ordered first when present; remaining files are ordered alphabetically.
   *
   * @param schema - The active schema
   * @returns Ordered spec-scoped artifact descriptors
   */
  private _listSpecArtifactDescriptors(
    schema: import('../../domain/value-objects/schema.js').Schema,
  ): SpecArtifactDescriptor[] {
    return schema
      .artifacts()
      .filter((artifactType) => artifactType.scope === 'spec')
      .map((artifactType) => {
        const filename = artifactType.output.split('/').pop()!
        return {
          artifactId: artifactType.id,
          filename,
          format: artifactType.format ?? inferFormat(filename) ?? 'plaintext',
        }
      })
      .sort((a, b) => {
        if (a.filename === 'spec.md') return -1
        if (b.filename === 'spec.md') return 1
        return a.filename.localeCompare(b.filename)
      })
  }

  /**
   * Loads the current base content for all spec-scoped artifacts defined by the schema.
   *
   * @param specRepo - Repository for loading base spec artifacts
   * @param spec - The target spec
   * @param descriptors - Ordered schema artifact descriptors
   * @returns Ordered content entries for existing base files
   */
  private async _loadBaseSpecFiles(
    specRepo: SpecRepository,
    spec: Spec,
    descriptors: readonly SpecArtifactDescriptor[],
  ): Promise<SpecContentFile[]> {
    const files: SpecContentFile[] = []

    for (const descriptor of descriptors) {
      const artifactFile = await specRepo.artifact(spec, descriptor.filename)
      if (artifactFile === null) continue
      files.push({
        artifactId: descriptor.artifactId,
        filename: descriptor.filename,
        content: artifactFile.content,
        format: descriptor.format,
      })
    }

    return files
  }

  /**
   * Overlays merged preview files on top of the base artifact set, preserving schema order.
   *
   * Unchanged base files remain in the output so full rendering shows the complete spec.
   *
   * @param previewFiles - Files returned by `PreviewSpec`
   * @param baseFiles - Base artifact files loaded from the repository
   * @param descriptors - Ordered schema artifact descriptors
   * @returns Ordered merged file set for display or extraction
   */
  private _mergePreviewFiles(
    previewFiles: readonly { filename: string; merged: string }[],
    baseFiles: readonly SpecContentFile[],
    descriptors: readonly SpecArtifactDescriptor[],
  ): SpecContentFile[] {
    const baseByFilename = new Map(baseFiles.map((file) => [file.filename, file]))
    const previewByFilename = new Map(previewFiles.map((file) => [file.filename, file]))
    const merged: SpecContentFile[] = []

    for (const descriptor of descriptors) {
      const preview = previewByFilename.get(descriptor.filename)
      if (preview !== undefined) {
        merged.push({
          artifactId: descriptor.artifactId,
          filename: descriptor.filename,
          content: preview.merged,
          format: descriptor.format,
        })
        continue
      }

      const base = baseByFilename.get(descriptor.filename)
      if (base !== undefined) merged.push(base)
    }

    return merged
  }

  /**
   * Extracts a best-effort title from the ordered artifact files by scanning for an H1 heading.
   *
   * @param files - Ordered artifact files
   * @returns The first discovered H1 text, or an empty string
   */
  private _extractTitleFromFiles(files: readonly SpecContentFile[]): string {
    for (const file of files) {
      const headingMatch = /^#\s+(.+)/m.exec(file.content)
      if (headingMatch !== null && headingMatch[1] !== undefined) {
        return headingMatch[1]
      }
    }
    return ''
  }

  /**
   * Renders ordered spec-scoped files into one readable text block with filename labels.
   *
   * @param files - Ordered files to render
   * @returns Concatenated content string
   */
  private _renderSpecFiles(files: readonly SpecContentFile[]): string {
    return files.map((file) => `#### ${file.filename}\n\n${file.content}`).join('\n\n')
  }

  /**
   * Parses a file set and extracts section-filtered metadata content from it.
   *
   * @param schema - Effective schema used to extract metadata from the files
   * @param files - Ordered source files to extract from
   * @param workspace - Workspace owning the spec
   * @param specPath - Capability path for transform context
   * @param workspaces - Orchestrated workspace map
   * @param sectionsFilter - Optional selected sections
   * @param llmOptimizedContext - Whether to prefer optimized fields
   * @returns Rendered section content
   */
  private async _renderExtractedSectionsFromFiles(
    schema: Schema,
    files: readonly SpecContentFile[],
    workspace: string,
    specPath: string,
    workspaces: Map<string, ProjectWorkspace>,
    sectionsFilter: ReadonlyArray<SpecSection>,
    llmOptimizedContext = false,
  ): Promise<string> {
    // Map ProjectWorkspace to direct repos for extractMetadataFromSpecArtifacts
    const repositories = new Map<string, SpecRepository>()
    for (const ws of workspaces.values()) {
      repositories.set(ws.name, ws.specRepo)
    }

    const extracted = await extractMetadataFromSpecArtifacts({
      effectiveSpecSchema: schema,
      workspace,
      specPath: SpecPath.parse(specPath),
      artifacts: files,
      parsers: this._parsers,
      extractorTransforms: this._extractorTransforms,
      repositories,
      workspaceRoutes: this._workspaceRoutes,
    })

    return this._renderFromMetadata(extracted.metadata, sectionsFilter, llmOptimizedContext)
  }

  /**
   * Extracts `dependsOn` from spec content using the schema's metadata extraction
   * declarations as a best-effort fallback.
   *
   * @param specRepo - Repository for loading spec artifacts
   * @param spec - The spec entity to extract from
   * @param workspaces - Orchestrated workspace map
   * @param fallback - Fallback configuration with extraction rules and parsers
   * @param preloadedFiles - Optional merged artifact set to extract from instead of base files
   * @returns Extracted dependsOn array, or undefined if extraction yields nothing
   */
  private async _extractDependsOnFallback(
    specRepo: SpecRepository,
    spec: Spec,
    workspaces: Map<string, ProjectWorkspace>,
    fallback: DependsOnFallback,
    preloadedFiles?: SpecContentFile[],
  ): Promise<string[] | undefined> {
    const descriptors = fallback.schemaArtifacts
      .filter((artifactType) => artifactType.scope === 'spec')
      .map((artifactType) => ({
        artifactId: artifactType.id,
        filename: artifactType.output.split('/').pop()!,
        format:
          artifactType.format ?? inferFormat(artifactType.output.split('/').pop()!) ?? 'plaintext',
      }))
    let files: readonly SpecContentFile[]
    if (preloadedFiles !== undefined && preloadedFiles.length > 0) {
      files = preloadedFiles
    } else {
      files = await this._loadBaseSpecFiles(specRepo, spec, descriptors)
      if (files.length === 0) return undefined
    }

    // Map ProjectWorkspace to direct repos for extractMetadataFromSpecArtifacts
    const repositories = new Map<string, SpecRepository>()
    for (const ws of workspaces.values()) {
      repositories.set(ws.name, ws.specRepo)
    }

    const extracted = await extractMetadataFromSpecArtifacts({
      effectiveSpecSchema: new Schema(
        'schema',
        'depends-on-fallback',
        1,
        fallback.schemaArtifacts,
        [],
        fallback.extraction,
      ),
      workspace: spec.workspace,
      specPath: spec.name,
      artifacts: files,
      parsers: this._parsers,
      extractorTransforms: this._extractorTransforms,
      repositories,
      workspaceRoutes: fallback.workspaceRoutes,
    })
    return extracted.metadata.dependsOn
  }
}
