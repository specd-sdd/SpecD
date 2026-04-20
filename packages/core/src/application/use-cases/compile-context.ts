import { type SpecMetadata } from '../../domain/services/parse-metadata.js'
import { ChangeNotFoundError } from '../errors/change-not-found-error.js'
import { SchemaMismatchError } from '../errors/schema-mismatch-error.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type SpecRepository } from '../ports/spec-repository.js'
import { type SchemaProvider } from '../ports/schema-provider.js'
import { type FileReader } from '../ports/file-reader.js'
import { type ArtifactParserRegistry } from '../ports/artifact-parser.js'
import { type ExtractorTransformRegistry } from '../../domain/services/content-extraction.js'
import { Spec } from '../../domain/entities/spec.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'
import { inferFormat } from '../../domain/services/format-inference.js'
import { parseSpecId } from '../../domain/services/parse-spec-id.js'
import { checkMetadataFreshness } from './_shared/metadata-freshness.js'
import { type ContentHasher } from '../ports/content-hasher.js'
import { type PreviewSpec } from './preview-spec.js'
import { type ContextWarning } from './_shared/context-warning.js'
import { extractMetadata, type SubtreeRenderer } from '../../domain/services/extract-metadata.js'
import { type SelectorNode } from '../../domain/services/selector-matching.js'
import { listMatchingSpecs, type ResolvedSpec } from './_shared/spec-pattern-matching.js'
import { traverseDependsOn, type DependsOnFallback } from './_shared/depends-on-traversal.js'
import { compileContextFingerprint } from './_shared/compile-context-fingerprint.js'
import { createExtractorTransformContext } from './_shared/extractor-transform-context.js'
import {
  createSpecReferenceResolver,
  type SpecWorkspaceRoute,
} from './_shared/spec-reference-resolver.js'

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
export type ContextEntry = { instruction: string } | { file: string }

/** Per-workspace configuration for context spec selection. */
export interface WorkspaceContextConfig {
  /** Include patterns evaluated only when this workspace is active. */
  readonly contextIncludeSpecs?: string[]
  /** Exclude patterns evaluated only when this workspace is active. */
  readonly contextExcludeSpecs?: string[]
}

/** Project configuration subset used by `CompileContext`. */
export interface CompileContextConfig {
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
}

/** Metadata section names that can be individually selected for output. */
export type SpecSection = 'rules' | 'constraints' | 'scenarios'

/** Input for the {@link CompileContext} use case. */
export interface CompileContextInput {
  /** The change name to compile context for. */
  readonly name: string
  /** The lifecycle step being entered (e.g. `'designing'`, `'implementing'`). */
  readonly step: string
  /** Resolved project configuration. */
  readonly config: CompileContextConfig
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

/** A workflow step with its availability status. */
export interface AvailableStep {
  /** The step name (e.g. `'designing'`, `'implementing'`). */
  readonly step: string
  /** Whether the step is currently available. */
  readonly available: boolean
  /** Artifact IDs blocking the step (empty if available). */
  readonly blockingArtifacts: readonly string[]
}

/** Result returned by a successful {@link CompileContext} execution. */
export interface CompileContextResult {
  /** The calculated fingerprint for the current context state. */
  readonly contextFingerprint: string
  /** Whether the full context was returned (`'changed'`) or fingerprint matched (`'unchanged'`). */
  readonly status: 'changed' | 'unchanged'
  /** Whether the requested step is currently available. */
  readonly stepAvailable: boolean
  /** Artifact IDs blocking the step; empty when `stepAvailable` is `true`. */
  readonly blockingArtifacts: readonly string[]
  /** Rendered project context entries. */
  readonly projectContext: readonly ProjectContextEntry[]
  /** Spec entries with display mode, source, and content. */
  readonly specs: readonly ContextSpecEntry[]
  /** All workflow steps with availability status. */
  readonly availableSteps: readonly AvailableStep[]
  /** Stale metadata warnings and other advisory conditions. */
  readonly warnings: readonly ContextWarning[]
}

/**
 * Assembles the structured context an AI agent receives when entering a lifecycle step.
 *
 * Collects context specs via five-step include/exclude/dependsOn resolution,
 * evaluates step availability, and returns structured project context entries,
 * spec entries (with display-mode classification), and available steps. Artifact
 * instructions and step hook instructions are separate concerns handled by
 * `GetArtifactInstruction` and `GetHookInstructions` respectively.
 */
export class CompileContext {
  private readonly _changes: ChangeRepository
  private readonly _specs: ReadonlyMap<string, SpecRepository>
  private readonly _schemaProvider: SchemaProvider
  private readonly _files: FileReader
  private readonly _parsers: ArtifactParserRegistry
  private readonly _hasher: ContentHasher
  private readonly _previewSpec: PreviewSpec
  private readonly _extractorTransforms: ExtractorTransformRegistry
  private readonly _workspaceRoutes: readonly SpecWorkspaceRoute[]

  /**
   * Creates a new `CompileContext` use case instance.
   *
   * @param changes - Repository for loading the change
   * @param specs - Spec repositories keyed by workspace name
   * @param schemaProvider - Provider for the fully-resolved schema
   * @param files - Reader for project-level context file entries
   * @param parsers - Registry of artifact format parsers
   * @param hasher - Content hasher for metadata freshness checks
   * @param previewSpec - Use case for merging deltas into spec content
   * @param extractorTransforms - Shared extractor transform registry
   * @param workspaceRoutes - Workspace routing metadata for cross-workspace resolution
   */
  constructor(
    changes: ChangeRepository,
    specs: ReadonlyMap<string, SpecRepository>,
    schemaProvider: SchemaProvider,
    files: FileReader,
    parsers: ArtifactParserRegistry,
    hasher: ContentHasher,
    previewSpec: PreviewSpec,
    extractorTransforms: ExtractorTransformRegistry = new Map(),
    workspaceRoutes: readonly SpecWorkspaceRoute[] = [],
  ) {
    this._changes = changes
    this._specs = specs
    this._schemaProvider = schemaProvider
    this._files = files
    this._parsers = parsers
    this._hasher = hasher
    this._previewSpec = previewSpec
    this._extractorTransforms = extractorTransforms
    this._workspaceRoutes = workspaceRoutes
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
    const change = await this._changes.get(input.name)
    if (change === null) throw new ChangeNotFoundError(input.name)

    const schema = await this._schemaProvider.get()

    // --- Schema name guard ---
    if (schema.name() !== change.schemaName) {
      throw new SchemaMismatchError(change.name, change.schemaName, schema.name())
    }

    const warnings: ContextWarning[] = []

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

    // --- 5-step context spec collection ---
    // Step 1: Project-level include patterns (all workspaces, bare * = all)
    for (const pattern of input.config.contextIncludeSpecs ?? []) {
      const matches = await listMatchingSpecs(pattern, 'default', true, this._specs, warnings)
      for (const spec of matches) {
        registerCollectedSpec(spec, 'includePattern')
      }
    }

    // Step 2: Project-level exclude patterns
    const projectExcludedKeys = new Set<string>()
    for (const pattern of input.config.contextExcludeSpecs ?? []) {
      const matches = await listMatchingSpecs(pattern, 'default', true, this._specs, warnings)
      for (const spec of matches) {
        projectExcludedKeys.add(`${spec.workspace}:${spec.capPath}`)
      }
    }
    for (const key of projectExcludedKeys) {
      if (!protectedKeys.has(key)) collectedSpecs.delete(key)
    }

    // Step 3: Workspace-level include patterns (active workspaces only)
    const activeWorkspaces = new Set(change.workspaces)

    for (const [wsName, wsConfig] of Object.entries(input.config.workspaces ?? {})) {
      if (!activeWorkspaces.has(wsName)) continue
      for (const pattern of wsConfig.contextIncludeSpecs ?? []) {
        const matches = await listMatchingSpecs(pattern, wsName, false, this._specs, warnings)
        for (const spec of matches) {
          registerCollectedSpec(spec, 'includePattern')
        }
      }
    }

    // Step 4: Workspace-level exclude patterns (active workspaces only)
    for (const [wsName, wsConfig] of Object.entries(input.config.workspaces ?? {})) {
      if (!activeWorkspaces.has(wsName)) continue
      for (const pattern of wsConfig.contextExcludeSpecs ?? []) {
        const matches = await listMatchingSpecs(pattern, wsName, false, this._specs, warnings)
        for (const spec of matches) {
          const key = `${spec.workspace}:${spec.capPath}`
          if (!protectedKeys.has(key)) collectedSpecs.delete(key)
        }
      }
    }

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
        const repo = this._specs.get(workspace)
        if (!repo) continue
        let specPathObj: SpecPath
        try {
          specPathObj = SpecPath.parse(capPath)
        } catch {
          continue
        }
        const spec = await repo.get(specPathObj)
        if (!spec) continue

        let dependsOnList: string[] | undefined

        const manifestDeps = change.specDependsOn.get(specId)
        if (manifestDeps !== undefined && manifestDeps.length > 0) {
          dependsOnList = [...manifestDeps]
        } else {
          const meta = await repo.metadata(spec)

          if (meta !== null) {
            dependsOnList = meta.dependsOn
          } else {
            warnings.push({
              type: 'missing-metadata',
              path: specId,
              message: `No metadata for '${specId}' — dependency traversal may be incomplete. Run metadata generation to fix.`,
            })

            if (depFallback !== undefined && depFallback.extraction.dependsOn !== undefined) {
              dependsOnList = await this._extractDependsOnFallback(repo, spec, depFallback)
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
              this._specs,
              warnings,
              input.depth,
              0,
              depFallback,
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
    const contextMode: 'list' | 'summary' | 'full' | 'hybrid' =
      input.config.contextMode ?? 'summary'

    // --- Step availability ---
    const schemaWorkflowStep = schema.workflowStep(input.step)
    let stepAvailable = true
    const blockingArtifacts: string[] = []

    if (schemaWorkflowStep !== null) {
      for (const requiredId of schemaWorkflowStep.requires) {
        const reqStatus = change.effectiveStatus(requiredId)
        if (reqStatus !== 'complete' && reqStatus !== 'skipped') {
          stepAvailable = false
          blockingArtifacts.push(requiredId)
        }
      }
    }

    // --- Part 1: Project context entries ---
    const projectContext: ProjectContextEntry[] = []
    for (const entry of input.config.context ?? []) {
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

    // --- Part 2: Spec entries ---
    const specArtifactDescriptors = this._listSpecArtifactDescriptors(schema)
    const sectionsFilter = input.sections
    const showAllSections = sectionsFilter === undefined
    const specs: ContextSpecEntry[] = []
    for (const { workspace, capPath } of allSpecs) {
      const specRepo = this._specs.get(workspace)
      if (specRepo === undefined) continue

      let specPathObj: SpecPath
      try {
        specPathObj = SpecPath.parse(capPath)
      } catch {
        continue
      }

      const spec = new Spec(workspace, specPathObj, [])
      const metadata = await specRepo.metadata(spec)
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

      // Extract title and description from metadata (needed for both modes)
      let title = ''
      let description = ''

      if (metadata !== null) {
        title = metadata.title ?? ''
        description = metadata.description ?? ''
      }

      let baseFiles: SpecContentFile[] | undefined
      let mergedFiles: SpecContentFile[] | undefined

      if (mode === 'summary') {
        // Summary only — no content rendering.
        if (title === '') {
          baseFiles = await this._loadBaseSpecFiles(specRepo, spec, specArtifactDescriptors)
          title = this._extractTitleFromFiles(baseFiles)
        }
        if (metadata === null) {
          warnings.push({
            type: 'stale-metadata',
            path: specId,
            message: `No metadata for '${specId}' — summary may lack description`,
          })
        }
        specs.push({ specId, title, description, source, mode })
        continue
      }

      // Full content rendering.
      // Attempt materialized delta view for specs in the change's specIds
      let content: string | undefined
      if (specIdsSet.has(specId)) {
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

      const displayFiles =
        mergedFiles ??
        (baseFiles ??= await this._loadBaseSpecFiles(specRepo, spec, specArtifactDescriptors))

      if (title === '') {
        title = this._extractTitleFromFiles(displayFiles)
      }

      // Fall back to metadata or extraction if preview didn't produce content
      if (content === undefined) {
        if (showAllSections) {
          content = this._renderSpecFiles(displayFiles)
        } else if (mergedFiles !== undefined) {
          const extraction = schema.metadataExtraction()
          if (extraction !== undefined) {
            content = await this._renderExtractedSectionsFromFiles(
              mergedFiles,
              extraction,
              workspace,
              capPath,
              sectionsFilter,
            )
          } else {
            content = ''
          }
        } else {
          let isFresh = false
          if (metadata !== null) {
            isFresh = await this._isMetadataFresh(specRepo, spec, metadata)
          }

          if (isFresh && metadata !== null) {
            content = this._renderFromMetadata(metadata, sectionsFilter, showAllSections)
          } else {
            if (metadata !== null) {
              warnings.push({
                type: 'stale-metadata',
                path: specId,
                message: `Metadata for '${specId}' is stale — falling back to raw artifact content`,
              })
            } else {
              warnings.push({
                type: 'stale-metadata',
                path: specId,
                message: `No metadata for '${specId}' — falling back to raw artifact content`,
              })
            }

            const extraction = schema.metadataExtraction()
            if (extraction !== undefined) {
              content = await this._renderExtractedSectionsFromFiles(
                displayFiles,
                extraction,
                workspace,
                capPath,
                sectionsFilter,
              )
            } else {
              content = ''
            }
          }
        }
      }

      specs.push({ specId, title, description, source, mode, content })
    }

    // --- Part 3: Available steps ---
    const availableSteps: AvailableStep[] = []
    for (const workflowStep of schema.workflow()) {
      const blocking: string[] = []
      for (const requiredId of workflowStep.requires) {
        const reqStatus = change.effectiveStatus(requiredId)
        if (reqStatus !== 'complete' && reqStatus !== 'skipped') {
          blocking.push(requiredId)
        }
      }
      availableSteps.push({
        step: workflowStep.step,
        available: blocking.length === 0,
        blockingArtifacts: blocking,
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
      stepAvailable,
      blockingArtifacts,
      projectContext,
      specs,
      availableSteps,
      warnings,
    })

    // If fingerprint matches, omit context content but keep everything else
    if (input.fingerprint !== undefined && input.fingerprint === currentFingerprint) {
      return {
        contextFingerprint: currentFingerprint,
        status: 'unchanged',
        stepAvailable,
        blockingArtifacts,
        projectContext: [],
        specs: [],
        availableSteps,
        warnings,
      }
    }

    return {
      contextFingerprint: currentFingerprint,
      status: 'changed',
      stepAvailable,
      blockingArtifacts,
      projectContext,
      specs,
      availableSteps,
      warnings,
    }
  }

  /**
   * Renders spec content from fresh metadata into a single string.
   *
   * @param metadata - The fresh parsed metadata
   * @param sectionsFilter - Optional filter to include only specific sections
   * @param showAll - Whether to include all sections regardless of filter
   * @returns Rendered content string
   */
  private _renderFromMetadata(
    metadata: SpecMetadata,
    sectionsFilter: ReadonlyArray<SpecSection> | undefined,
    showAll: boolean,
  ): string {
    const metaParts: string[] = []
    if (showAll && metadata.description !== undefined) {
      metaParts.push(`**Description:** ${metadata.description}`)
    }
    if ((showAll || sectionsFilter?.includes('rules')) && metadata.rules?.length) {
      const rulesText = metadata.rules
        .map((r) => `##### ${r.requirement}\n${r.rules.map((rule) => `- ${rule}`).join('\n')}`)
        .join('\n\n')
      metaParts.push(`#### Rules\n\n${rulesText}`)
    }
    if ((showAll || sectionsFilter?.includes('constraints')) && metadata.constraints?.length) {
      const constraintsText = metadata.constraints.map((c) => `- ${c}`).join('\n')
      metaParts.push(`#### Constraints\n\n${constraintsText}`)
    }
    if ((showAll || sectionsFilter?.includes('scenarios')) && metadata.scenarios?.length) {
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
   * @param files - Ordered source files to extract from
   * @param extraction - Schema metadata extraction declarations
   * @param workspace - Workspace owning the spec
   * @param specPath - Capability path for transform context
   * @param sectionsFilter - Required selected sections
   * @returns Rendered section content
   */
  private async _renderExtractedSectionsFromFiles(
    files: readonly SpecContentFile[],
    extraction: import('../../domain/value-objects/metadata-extraction.js').MetadataExtraction,
    workspace: string,
    specPath: string,
    sectionsFilter: ReadonlyArray<SpecSection>,
  ): Promise<string> {
    const astsByArtifact = new Map<string, { root: SelectorNode }>()
    const renderers = new Map<string, SubtreeRenderer>()
    const transformContexts = new Map<string, ReturnType<typeof createExtractorTransformContext>>()
    const originSpecPath = SpecPath.parse(specPath)
    const resolveSpecReference = createSpecReferenceResolver({
      originWorkspace: workspace,
      originSpecPath,
      repositories: this._specs,
      workspaceRoutes: this._workspaceRoutes,
    })

    for (const file of files) {
      const parser = this._parsers.get(file.format)
      if (parser === undefined) continue

      const ast = parser.parse(file.content)
      astsByArtifact.set(file.artifactId, ast)
      renderers.set(file.artifactId, parser as SubtreeRenderer)
      transformContexts.set(
        file.artifactId,
        createExtractorTransformContext(workspace, specPath, file.artifactId, file.filename, {
          resolveSpecReference,
        }),
      )
    }

    const extracted = await extractMetadata(
      extraction,
      astsByArtifact,
      renderers,
      this._extractorTransforms,
      transformContexts,
    )

    return this._renderFromMetadata(extracted, sectionsFilter, false)
  }

  /**
   * Extracts `dependsOn` from spec content using the schema's metadata extraction
   * declarations as a best-effort fallback.
   *
   * @param specRepo - Repository for loading spec artifacts
   * @param spec - The spec entity to extract from
   * @param fallback - Fallback configuration with extraction rules and parsers
   * @returns Extracted dependsOn array, or undefined if extraction yields nothing
   */
  private async _extractDependsOnFallback(
    specRepo: import('../ports/spec-repository.js').SpecRepository,
    spec: Spec,
    fallback: DependsOnFallback,
  ): Promise<string[] | undefined> {
    const descriptors = fallback.schemaArtifacts
      .filter((artifactType) => artifactType.scope === 'spec')
      .map((artifactType) => ({
        artifactId: artifactType.id,
        filename: artifactType.output.split('/').pop()!,
        format:
          artifactType.format ?? inferFormat(artifactType.output.split('/').pop()!) ?? 'plaintext',
      }))
    const files = await this._loadBaseSpecFiles(specRepo, spec, descriptors)
    const astsByArtifact = new Map<string, { root: SelectorNode }>()
    const renderers = new Map<string, SubtreeRenderer>()
    const transformContexts = new Map<string, ReturnType<typeof createExtractorTransformContext>>()
    const resolveSpecReference = createSpecReferenceResolver({
      originWorkspace: spec.workspace,
      originSpecPath: spec.name,
      repositories: this._specs,
      workspaceRoutes: fallback.workspaceRoutes,
    })

    for (const file of files) {
      const parser = this._parsers.get(file.format)
      if (parser === undefined) continue

      const ast = parser.parse(file.content)
      astsByArtifact.set(file.artifactId, ast)
      renderers.set(file.artifactId, parser as SubtreeRenderer)
      transformContexts.set(
        file.artifactId,
        createExtractorTransformContext(
          spec.workspace,
          spec.name.toString(),
          file.artifactId,
          file.filename,
          {
            resolveSpecReference,
          },
        ),
      )
    }

    if (astsByArtifact.size === 0) return undefined

    const extracted = await extractMetadata(
      fallback.extraction,
      astsByArtifact,
      renderers,
      this._extractorTransforms,
      transformContexts,
    )
    return extracted.dependsOn
  }

  /**
   * Checks whether a spec's `metadata.json` is fresh by comparing
   * SHA-256 hashes of current spec artifact files against the recorded hashes.
   *
   * @param specRepo - Repository to read spec artifact files from
   * @param spec - The spec to check
   * @param metadata - The parsed metadata containing `contentHashes`
   * @returns `true` if all hashes match, `false` if any mismatch or file is missing
   */
  private async _isMetadataFresh(
    specRepo: SpecRepository,
    spec: Spec,
    metadata: SpecMetadata,
  ): Promise<boolean> {
    const result = await checkMetadataFreshness(
      metadata.contentHashes,
      async (filename) => {
        const artifact = await specRepo.artifact(spec, filename)
        return artifact?.content ?? null
      },
      (c) => this._hasher.hash(c),
    )
    return result.allFresh
  }
}
