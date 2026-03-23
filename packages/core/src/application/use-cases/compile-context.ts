import { type SpecMetadata } from '../../domain/services/parse-metadata.js'
import { ChangeNotFoundError } from '../errors/change-not-found-error.js'
import { SchemaNotFoundError } from '../errors/schema-not-found-error.js'
import { SchemaMismatchError } from '../errors/schema-mismatch-error.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type SpecRepository } from '../ports/spec-repository.js'
import { type SchemaProvider } from '../ports/schema-provider.js'
import { type FileReader } from '../ports/file-reader.js'
import { type ArtifactParserRegistry } from '../ports/artifact-parser.js'
import { Spec } from '../../domain/entities/spec.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'
import { inferFormat } from '../../domain/services/format-inference.js'
import { parseSpecId } from '../../domain/services/parse-spec-id.js'
import { checkMetadataFreshness } from './_shared/metadata-freshness.js'
import { type ContentHasher } from '../ports/content-hasher.js'
import { type ContextWarning } from './_shared/context-warning.js'
import { extractMetadata, type SubtreeRenderer } from '../../domain/services/extract-metadata.js'
import { type SelectorNode } from '../../domain/services/selector-matching.js'
import { listMatchingSpecs, type ResolvedSpec } from './_shared/spec-pattern-matching.js'
import { traverseDependsOn, type DependsOnFallback } from './_shared/depends-on-traversal.js'

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
   * - `'lazy'` (default) — tier 1 specs (specIds + specDependsOn) in full; tier 2 as summaries.
   * - `'full'` — all specs rendered with full content.
   */
  readonly contextMode?: 'full' | 'lazy'
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
  /** The spec title from metadata or heading extraction. */
  readonly title: string
  /** The spec description from metadata (2-3 sentence summary). */
  readonly description: string
  /** How this spec was collected. */
  readonly source: ContextSpecSource
  /** Whether full content or just summary was rendered. */
  readonly mode: 'full' | 'summary'
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
  /** Whether the requested step is currently available. */
  readonly stepAvailable: boolean
  /** Artifact IDs blocking the step; empty when `stepAvailable` is `true`. */
  readonly blockingArtifacts: readonly string[]
  /** Rendered project context entries. */
  readonly projectContext: readonly ProjectContextEntry[]
  /** Spec entries with tier classification, source, and content. */
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
 * spec entries (with tier classification), and available steps. Artifact
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

  /**
   * Creates a new `CompileContext` use case instance.
   *
   * @param changes - Repository for loading the change
   * @param specs - Spec repositories keyed by workspace name
   * @param schemaProvider - Provider for the fully-resolved schema
   * @param files - Reader for project-level context file entries
   * @param parsers - Registry of artifact format parsers
   * @param hasher - Content hasher for metadata freshness checks
   */
  constructor(
    changes: ChangeRepository,
    specs: ReadonlyMap<string, SpecRepository>,
    schemaProvider: SchemaProvider,
    files: FileReader,
    parsers: ArtifactParserRegistry,
    hasher: ContentHasher,
  ) {
    this._changes = changes
    this._specs = specs
    this._schemaProvider = schemaProvider
    this._files = files
    this._parsers = parsers
    this._hasher = hasher
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
    if (schema === null) throw new SchemaNotFoundError('(provider)')

    // --- Schema name guard ---
    if (schema.name() !== change.schemaName) {
      throw new SchemaMismatchError(change.name, change.schemaName, schema.name())
    }

    const warnings: ContextWarning[] = []

    // --- Source tracking: build sets for tier classification ---
    const specIdsSet = new Set(change.specIds)
    const specDependsOnSet = new Set<string>()
    for (const deps of change.specDependsOn.values()) {
      for (const dep of deps) specDependsOnSet.add(dep)
    }
    const sourceMap = new Map<string, ContextSpecSource>()

    // Pre-populate sources for specIds and specDependsOn
    for (const id of specIdsSet) sourceMap.set(id, 'specIds')
    for (const id of specDependsOnSet) {
      if (!sourceMap.has(id)) sourceMap.set(id, 'specDependsOn')
    }

    // --- 5-step context spec collection ---
    const includedSpecs = new Map<string, ResolvedSpec>()

    // Step 1: Project-level include patterns (all workspaces, bare * = all)
    for (const pattern of input.config.contextIncludeSpecs ?? []) {
      const matches = await listMatchingSpecs(pattern, 'default', true, this._specs, warnings)
      for (const spec of matches) {
        const key = `${spec.workspace}:${spec.capPath}`
        if (!includedSpecs.has(key)) includedSpecs.set(key, spec)
        if (!sourceMap.has(key)) sourceMap.set(key, 'includePattern')
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
    for (const key of projectExcludedKeys) includedSpecs.delete(key)

    // Step 3: Workspace-level include patterns (active workspaces only)
    const activeWorkspaces = new Set(change.workspaces)

    for (const [wsName, wsConfig] of Object.entries(input.config.workspaces ?? {})) {
      if (!activeWorkspaces.has(wsName)) continue
      for (const pattern of wsConfig.contextIncludeSpecs ?? []) {
        const matches = await listMatchingSpecs(pattern, wsName, false, this._specs, warnings)
        for (const spec of matches) {
          const key = `${spec.workspace}:${spec.capPath}`
          if (!includedSpecs.has(key)) includedSpecs.set(key, spec)
          if (!sourceMap.has(key)) sourceMap.set(key, 'includePattern')
        }
      }
    }

    // Step 4: Workspace-level exclude patterns (active workspaces only)
    for (const [wsName, wsConfig] of Object.entries(input.config.workspaces ?? {})) {
      if (!activeWorkspaces.has(wsName)) continue
      for (const pattern of wsConfig.contextExcludeSpecs ?? []) {
        const matches = await listMatchingSpecs(pattern, wsName, false, this._specs, warnings)
        for (const spec of matches) {
          includedSpecs.delete(`${spec.workspace}:${spec.capPath}`)
        }
      }
    }

    // Step 5: dependsOn traversal from change.specIds (only when followDeps is true)
    const dependsOnAdded = new Map<string, ResolvedSpec>()
    if (input.followDeps === true) {
      const extraction = schema.metadataExtraction()
      const depFallback: DependsOnFallback | undefined =
        extraction !== undefined
          ? { extraction, schemaArtifacts: schema.artifacts(), parsers: this._parsers }
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
              includedSpecs,
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
      for (const [key] of dependsOnAdded) {
        const existing = sourceMap.get(key)
        if (existing === undefined || existing === 'includePattern') {
          sourceMap.set(key, 'dependsOnTraversal')
        }
      }
    }

    // Merge: includedSpecs first (preserve order), then dependsOnAdded
    const allSpecs: ResolvedSpec[] = [...includedSpecs.values()]
    for (const [key, spec] of dependsOnAdded) {
      if (!includedSpecs.has(key)) allSpecs.push(spec)
    }

    // --- Tier classification ---
    const contextMode = input.config.contextMode ?? 'lazy'

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

      // Determine mode based on contextMode and source
      const mode: 'full' | 'summary' =
        contextMode === 'lazy' && source !== 'specIds' && source !== 'specDependsOn'
          ? 'summary'
          : 'full'

      // Extract title and description from metadata (needed for both modes)
      let title = ''
      let description = ''

      if (metadata !== null) {
        title = metadata.title ?? ''
        description = metadata.description ?? ''
      }

      // If no title from metadata, extract from spec heading
      if (title === '') {
        const specArtifact = await specRepo.artifact(spec, 'spec.md')
        if (specArtifact !== null) {
          const headingMatch = /^#\s+(.+)/m.exec(specArtifact.content)
          if (headingMatch !== null && headingMatch[1] !== undefined) title = headingMatch[1]
        }
      }

      if (mode === 'summary') {
        // Tier 2: summary only — no content rendering
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

      // Tier 1: full content rendering
      let isFresh = false
      if (metadata !== null) {
        isFresh = await this._isMetadataFresh(specRepo, spec, metadata)
      }

      const sectionsFilter = input.sections
      const showAll = sectionsFilter === undefined

      let content: string

      if (isFresh && metadata !== null) {
        content = this._renderFromMetadata(metadata, sectionsFilter, showAll)
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
        let fallbackParts: string[] = []

        if (extraction !== undefined) {
          fallbackParts = await this._extractionFallback(
            specRepo,
            spec,
            schema,
            extraction,
            specId,
            sectionsFilter,
            showAll,
          )
        }

        content = fallbackParts.join('\n\n')
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

    return {
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
    const astsByArtifact = new Map<string, { root: SelectorNode }>()
    const renderers = new Map<string, SubtreeRenderer>()

    for (const artifactType of fallback.schemaArtifacts) {
      if (artifactType.scope !== 'spec') continue
      const filename = artifactType.output.split('/').pop()!
      const format = artifactType.format ?? inferFormat(filename) ?? 'plaintext'
      const parser = this._parsers.get(format)
      if (parser === undefined) continue

      const artifactFile = await specRepo.artifact(spec, filename)
      if (artifactFile === null) continue

      const ast = parser.parse(artifactFile.content)
      astsByArtifact.set(artifactType.id, ast)
      renderers.set(artifactType.id, parser as SubtreeRenderer)
    }

    if (astsByArtifact.size === 0) return undefined

    const extracted = extractMetadata(fallback.extraction, astsByArtifact, renderers)
    return extracted.dependsOn
  }

  /**
   * Falls back to the metadataExtraction engine when metadata is stale/absent.
   *
   * @param specRepo - Repository for loading spec artifacts
   * @param spec - The spec entity to extract metadata from
   * @param schema - The resolved schema with artifact definitions
   * @param extraction - The metadata extraction declarations from the schema
   * @param specLabel - Display label for the spec (e.g. `workspace:capPath`)
   * @param sectionsFilter - Optional filter to include only specific sections
   * @param showAll - Whether to include all sections regardless of filter
   * @returns Rendered context parts as strings
   */
  private async _extractionFallback(
    specRepo: SpecRepository,
    spec: Spec,
    schema: import('../../domain/value-objects/schema.js').Schema,
    extraction: import('../../domain/value-objects/metadata-extraction.js').MetadataExtraction,
    specLabel: string,
    sectionsFilter: ReadonlyArray<SpecSection> | undefined,
    showAll: boolean,
  ): Promise<string[]> {
    const astsByArtifact = new Map<string, { root: SelectorNode }>()
    const renderers = new Map<string, SubtreeRenderer>()

    for (const artifactType of schema.artifacts()) {
      if (artifactType.scope !== 'spec') continue
      const filename = artifactType.output.split('/').pop()!
      const format = artifactType.format ?? inferFormat(filename) ?? 'plaintext'
      const parser = this._parsers.get(format)
      if (parser === undefined) continue

      const artifactFile = await specRepo.artifact(spec, filename)
      if (artifactFile === null) continue

      const ast = parser.parse(artifactFile.content)
      astsByArtifact.set(artifactType.id, ast)
      renderers.set(artifactType.id, parser as SubtreeRenderer)
    }

    const extracted = extractMetadata(extraction, astsByArtifact, renderers)
    const metaParts: string[] = []

    if (showAll && extracted.description !== undefined) {
      metaParts.push(`**Description:** ${extracted.description}`)
    }
    if ((showAll || sectionsFilter?.includes('rules')) && extracted.rules?.length) {
      const rulesText = extracted.rules
        .map((r) => `##### ${r.requirement}\n${r.rules.map((rule) => `- ${rule}`).join('\n')}`)
        .join('\n\n')
      metaParts.push(`#### Rules\n\n${rulesText}`)
    }
    if ((showAll || sectionsFilter?.includes('constraints')) && extracted.constraints?.length) {
      metaParts.push(`#### Constraints\n\n${extracted.constraints.map((c) => `- ${c}`).join('\n')}`)
    }
    if ((showAll || sectionsFilter?.includes('scenarios')) && extracted.scenarios?.length) {
      const scenariosText = extracted.scenarios
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

    return metaParts
  }

  /**
   * Checks whether a spec's `.specd-metadata.yaml` is fresh by comparing
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
