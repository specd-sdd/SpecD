import { type SpecMetadata } from '../../domain/services/parse-metadata.js'
import { parseMetadata } from './_shared/parse-metadata.js'
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
import { shiftHeadings } from '../../domain/services/shift-headings.js'
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
   * When present, restricts the metadata sections rendered per spec to the listed values.
   * When absent, all sections are rendered (description + rules + constraints + scenarios).
   * Does not affect available steps.
   */
  readonly sections?: ReadonlyArray<SpecSection>
}

/** Result returned by a successful {@link CompileContext} execution. */
export interface CompileContextResult {
  /** Whether the requested step is currently available. */
  readonly stepAvailable: boolean
  /** Artifact IDs blocking the step; empty when `stepAvailable` is `true`. */
  readonly blockingArtifacts: string[]
  /** The fully assembled context text (project context + spec content + available steps). */
  readonly contextBlock: string
  /** Stale metadata warnings and other advisory conditions. */
  readonly warnings: ContextWarning[]
}

/**
 * Assembles the context block an AI agent receives when entering a lifecycle step.
 *
 * Collects context specs via five-step include/exclude/dependsOn resolution,
 * evaluates step availability, and combines project context entries, spec content,
 * and available steps into a single structured output. Artifact instructions and
 * step hook instructions are separate concerns handled by `GetArtifactInstruction`
 * and `GetHookInstructions` respectively.
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
   * Compiles the context block for the given lifecycle step.
   *
   * @param input - Context compilation parameters
   * @returns Assembled context result with context block and warnings
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

    // --- 5-step context spec collection ---
    const includedSpecs = new Map<string, ResolvedSpec>()

    // Step 1: Project-level include patterns (all workspaces, bare * = all)
    for (const pattern of input.config.contextIncludeSpecs ?? []) {
      const matches = await listMatchingSpecs(pattern, 'default', true, this._specs, warnings)
      for (const spec of matches) {
        const key = `${spec.workspace}:${spec.capPath}`
        if (!includedSpecs.has(key)) includedSpecs.set(key, spec)
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
    // Per change spec: CompileContext reads workspaces from the change manifest;
    // it does not infer active workspaces from spec paths at compile time.
    const activeWorkspaces = new Set(change.workspaces)

    for (const [wsName, wsConfig] of Object.entries(input.config.workspaces ?? {})) {
      if (!activeWorkspaces.has(wsName)) continue
      for (const pattern of wsConfig.contextIncludeSpecs ?? []) {
        // At workspace level, unqualified path = that workspace; bare * = just that workspace
        const matches = await listMatchingSpecs(pattern, wsName, false, this._specs, warnings)
        for (const spec of matches) {
          const key = `${spec.workspace}:${spec.capPath}`
          if (!includedSpecs.has(key)) includedSpecs.set(key, spec)
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
      // Build fallback for extracting dependsOn from spec content when metadata is absent
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
        // Three-tier dependsOn resolution:
        // 1. change.specDependsOn (manifest) — highest priority
        // 2. .specd-metadata.yaml dependsOn field
        // 3. Content extraction via metadataExtraction — fallback
        let dependsOnList: string[] | undefined

        const manifestDeps = change.specDependsOn.get(specId)
        if (manifestDeps !== undefined && manifestDeps.length > 0) {
          dependsOnList = [...manifestDeps]
        } else {
          const metaArtifact = await repo.artifact(spec, '.specd-metadata.yaml')

          if (metaArtifact !== null) {
            try {
              const meta = parseMetadata(metaArtifact.content)
              dependsOnList = meta.dependsOn
            } catch {
              // Skip specs with unparseable metadata
            }
          } else {
            warnings.push({
              type: 'missing-metadata',
              path: specId,
              message: `No .specd-metadata.yaml for '${specId}' — dependency traversal may be incomplete. Run metadata generation to fix.`,
            })

            // Attempt fallback extraction from spec content
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
    }

    // Merge: includedSpecs first (preserve order), then dependsOnAdded
    const allSpecs: ResolvedSpec[] = [...includedSpecs.values()]
    for (const [key, spec] of dependsOnAdded) {
      if (!includedSpecs.has(key)) allSpecs.push(spec)
    }

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

    // --- Assemble instruction block ---
    const parts: string[] = []

    // Part 1: Project context entries (labelled with source, headings shifted +1)
    for (const entry of input.config.context ?? []) {
      if ('instruction' in entry) {
        parts.push(`**Source: instruction**\n\n${entry.instruction}`)
      } else {
        const content = await this._files.read(entry.file)
        if (content === null) {
          warnings.push({
            type: 'missing-file',
            path: entry.file,
            message: `Context file '${entry.file}' not found`,
          })
        } else {
          parts.push(`**Source: ${entry.file}**\n\n${shiftHeadings(content, 1)}`)
        }
      }
    }

    // Part 2: Spec content
    const specContentParts: string[] = []
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
      const metadataArtifact = await specRepo.artifact(spec, '.specd-metadata.yaml')

      let isFresh = false
      let metadata: SpecMetadata | null = null

      if (metadataArtifact !== null) {
        metadata = parseMetadata(metadataArtifact.content)
        isFresh = await this._isMetadataFresh(specRepo, spec, metadata)
      }

      const specLabel = `${workspace}:${capPath}`

      const sectionsFilter = input.sections
      const showAll = sectionsFilter === undefined

      if (isFresh && metadata !== null) {
        // Fresh metadata path
        const metaParts: string[] = []
        if (showAll && metadata.description !== undefined) {
          metaParts.push(`**Description:** ${metadata.description}`)
        }
        if ((showAll || sectionsFilter.includes('rules')) && metadata.rules?.length) {
          const rulesText = metadata.rules
            .map((r) => `##### ${r.requirement}\n${r.rules.map((rule) => `- ${rule}`).join('\n')}`)
            .join('\n\n')
          metaParts.push(`#### Rules\n\n${rulesText}`)
        }
        if ((showAll || sectionsFilter.includes('constraints')) && metadata.constraints?.length) {
          const constraintsText = metadata.constraints.map((c) => `- ${c}`).join('\n')
          metaParts.push(`#### Constraints\n\n${constraintsText}`)
        }
        if ((showAll || sectionsFilter.includes('scenarios')) && metadata.scenarios?.length) {
          const scenariosText = metadata.scenarios
            .map((s) => {
              const lines: string[] = [
                `##### Scenario: ${s.name}`,
                `*Requirement: ${s.requirement}*`,
              ]
              if (s.given?.length) lines.push(`**Given:** ${s.given.join('; ')}`)
              if (s.when?.length) lines.push(`**When:** ${s.when.join('; ')}`)
              if (s.then?.length) lines.push(`**Then:** ${s.then.join('; ')}`)
              return lines.join('\n')
            })
            .join('\n\n')
          metaParts.push(`#### Scenarios\n\n${scenariosText}`)
        }
        specContentParts.push(`### Spec: ${specLabel}\n\n${metaParts.join('\n\n')}`)
      } else {
        // Stale/absent metadata: fall back to metadataExtraction engine
        if (metadataArtifact !== null) {
          warnings.push({
            type: 'stale-metadata',
            path: specLabel,
            message: `Metadata for '${specLabel}' is stale — falling back to raw artifact content`,
          })
        } else {
          warnings.push({
            type: 'stale-metadata',
            path: specLabel,
            message: `No metadata for '${specLabel}' — falling back to raw artifact content`,
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
            specLabel,
            sectionsFilter,
            showAll,
          )
        }

        if (fallbackParts.length > 0) {
          specContentParts.push(`### Spec: ${specLabel}\n\n${fallbackParts.join('\n\n')}`)
        } else {
          specContentParts.push(`### Spec: ${specLabel}`)
        }
      }
    }

    if (specContentParts.length > 0) {
      parts.push(`## Spec content\n\n${specContentParts.join('\n\n---\n\n')}`)
    }

    // Part 3: Available steps
    const stepLines: string[] = []
    for (const workflowStep of schema.workflow()) {
      const blocking: string[] = []
      for (const requiredId of workflowStep.requires) {
        const reqStatus = change.effectiveStatus(requiredId)
        if (reqStatus !== 'complete' && reqStatus !== 'skipped') {
          blocking.push(requiredId)
        }
      }
      if (blocking.length === 0) {
        stepLines.push(`- ${workflowStep.step}: available`)
      } else {
        stepLines.push(`- ${workflowStep.step}: unavailable — requires: [${blocking.join(', ')}]`)
      }
    }

    if (stepLines.length > 0) {
      parts.push(`## Available steps\n\n${stepLines.join('\n')}`)
    }

    return {
      stepAvailable,
      blockingArtifacts,
      contextBlock: parts.join('\n\n---\n\n'),
      warnings,
    }
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
   * Loads artifacts, parses ASTs, runs extractors, and renders the result as
   * context parts in the same format as the fresh metadata path.
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
