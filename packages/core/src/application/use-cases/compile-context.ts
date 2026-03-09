import { type SpecMetadata } from '../../domain/services/parse-metadata.js'
import { parseMetadata } from './_shared/parse-metadata.js'
import { ChangeNotFoundError } from '../errors/change-not-found-error.js'
import { SchemaNotFoundError } from '../errors/schema-not-found-error.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type SpecRepository } from '../ports/spec-repository.js'
import { type SchemaRegistry } from '../ports/schema-registry.js'
import { type FileReader } from '../ports/file-reader.js'
import { type ArtifactParserRegistry, type OutlineEntry } from '../ports/artifact-parser.js'
import { Spec } from '../../domain/entities/spec.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'
import { type WorkflowStep } from '../../domain/value-objects/workflow-step.js'
import { inferFormat } from '../../domain/services/format-inference.js'
import { parseSpecId } from '../../domain/services/parse-spec-id.js'
import { checkMetadataFreshness } from './_shared/metadata-freshness.js'
import { shiftHeadings } from '../../domain/services/shift-headings.js'
import { type WorkspaceContext } from '../ports/workspace-context.js'
import { type ContentHasher } from '../ports/content-hasher.js'
import { type ContextWarning } from './_shared/context-warning.js'
import { findNodes } from './_shared/selector-matching.js'
import { listMatchingSpecs, type ResolvedSpec } from './_shared/spec-pattern-matching.js'
import { traverseDependsOn } from './_shared/depends-on-traversal.js'

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
   * Per-artifact additional constraint strings injected below the schema instruction.
   * Keyed by artifact ID.
   */
  readonly artifactRules?: Record<string, string[]>
  /** Project-level workflow hook overrides; merged after schema hooks. */
  readonly workflow?: readonly WorkflowStep[]
  /** Per-workspace context include/exclude patterns. */
  readonly workspaces?: Record<string, WorkspaceContextConfig>
}

/** Metadata section names that can be individually selected for output. */
export type SpecSection = 'rules' | 'constraints' | 'scenarios'

/** Input for the {@link CompileContext} use case. */
export interface CompileContextInput extends WorkspaceContext {
  /** The change name to compile context for. */
  readonly name: string
  /** The lifecycle step being entered (e.g. `'designing'`, `'implementing'`). */
  readonly step: string
  /**
   * The artifact ID currently being generated. Only applicable to the `designing` step.
   * When present, only this artifact's instruction and rules are injected.
   * When absent, no artifact instructions are injected.
   */
  readonly activeArtifact?: string
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
   * Does not affect schema instructions, delta context, artifact rules, hooks, or available steps.
   */
  readonly sections?: ReadonlyArray<SpecSection>
}

/** Result returned by a successful {@link CompileContext} execution. */
export interface CompileContextResult {
  /** Whether the requested step is currently available. */
  readonly stepAvailable: boolean
  /** Artifact IDs blocking the step; empty when `stepAvailable` is `true`. */
  readonly blockingArtifacts: string[]
  /** The fully assembled instruction text to inject into the AI context. */
  readonly instructionBlock: string
  /** Stale metadata warnings and other advisory conditions. */
  readonly warnings: ContextWarning[]
}

/**
 * Assembles the instruction block an AI agent receives when entering a lifecycle step.
 *
 * Collects context specs via five-step include/exclude/dependsOn resolution,
 * evaluates step availability, and combines schema instructions, artifact rules,
 * spec content, and step hooks into a single structured output.
 */
export class CompileContext {
  private readonly _changes: ChangeRepository
  private readonly _specs: ReadonlyMap<string, SpecRepository>
  private readonly _schemas: SchemaRegistry
  private readonly _files: FileReader
  private readonly _parsers: ArtifactParserRegistry
  private readonly _hasher: ContentHasher

  /**
   * Creates a new `CompileContext` use case instance.
   *
   * @param changes - Repository for loading the change
   * @param specs - Spec repositories keyed by workspace name
   * @param schemas - Registry for resolving schema references
   * @param files - Reader for project-level context file entries
   * @param parsers - Registry of artifact format parsers
   * @param hasher - Content hasher for metadata freshness checks
   */
  constructor(
    changes: ChangeRepository,
    specs: ReadonlyMap<string, SpecRepository>,
    schemas: SchemaRegistry,
    files: FileReader,
    parsers: ArtifactParserRegistry,
    hasher: ContentHasher,
  ) {
    this._changes = changes
    this._specs = specs
    this._schemas = schemas
    this._files = files
    this._parsers = parsers
    this._hasher = hasher
  }

  /**
   * Compiles the instruction block for the given lifecycle step.
   *
   * @param input - Context compilation parameters
   * @returns Assembled context result with instruction block and warnings
   * @throws {ChangeNotFoundError} If no change with the given name exists
   * @throws {SchemaNotFoundError} If the schema reference cannot be resolved
   */
  async execute(input: CompileContextInput): Promise<CompileContextResult> {
    const change = await this._changes.get(input.name)
    if (change === null) throw new ChangeNotFoundError(input.name)

    const schema = await this._schemas.resolve(input.schemaRef, input.workspaceSchemasPaths)
    if (schema === null) throw new SchemaNotFoundError(input.schemaRef)

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

    // Step 5: dependsOn traversal from change.contextSpecIds (only when followDeps is true)
    const dependsOnAdded = new Map<string, ResolvedSpec>()
    if (input.followDeps === true) {
      const depSeen = new Set<string>()
      for (const ctxSpecId of change.contextSpecIds) {
        const { workspace: ctxWs, capPath: ctxCapPath } = parseSpecId(ctxSpecId)
        await traverseDependsOn(
          ctxWs,
          ctxCapPath,
          includedSpecs,
          dependsOnAdded,
          depSeen,
          new Set<string>(),
          this._specs,
          warnings,
          input.depth,
          0,
        )
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

    // Part 2: Schema instruction for active artifact
    const activeArtifactType =
      input.activeArtifact !== undefined ? schema.artifact(input.activeArtifact) : null

    if (activeArtifactType !== null) {
      const instruction = activeArtifactType.instruction()
      if (instruction !== undefined) {
        parts.push(`## Artifact instruction: ${activeArtifactType.id()}\n\n${instruction}`)
      }
    }

    // Part 3: Delta context (only when activeArtifact has delta: true)
    if (activeArtifactType !== null && activeArtifactType.delta()) {
      const format =
        activeArtifactType.format() ?? inferFormat(activeArtifactType.output()) ?? 'plaintext'
      const parser = this._parsers.get(format)
      if (parser === undefined) {
        warnings.push({
          type: 'missing-parser',
          path: format,
          message: `No parser registered for format '${format}' — delta context skipped`,
        })
      } else {
        const deltaContextParts: string[] = []

        // Format instructions
        deltaContextParts.push(`### Format instructions\n\n${parser.deltaInstructions()}`)

        // Domain instructions
        const domainInstr = activeArtifactType.deltaInstruction()
        if (domainInstr !== undefined) {
          deltaContextParts.push(`### Domain instructions\n\n${domainInstr}`)
        }

        // Existing artifact outlines
        const outlineParts: string[] = []
        for (const specId of change.specIds) {
          const { workspace, capPath } = parseSpecId(specId)
          if (!capPath) continue

          const specRepo = this._specs.get(workspace)
          if (specRepo === undefined) continue

          let specPathObj: SpecPath
          try {
            specPathObj = SpecPath.parse(capPath)
          } catch {
            continue
          }

          const spec = new Spec(workspace, specPathObj, [])
          const deltaOutputFilename = activeArtifactType.output().split('/').pop()!
          const artifactFile = await specRepo.artifact(spec, deltaOutputFilename)
          if (artifactFile === null) continue

          const ast = parser.parse(artifactFile.content)
          const outlineEntries = parser.outline(ast)
          if (outlineEntries.length > 0) {
            const outlineText = this._renderOutline(outlineEntries)
            outlineParts.push(
              `**${workspace}:${capPath}/${activeArtifactType.output()}**\n${outlineText}`,
            )
          }
        }

        if (outlineParts.length > 0) {
          deltaContextParts.push(`### Existing artifact outlines\n\n${outlineParts.join('\n\n')}`)
        }

        parts.push(
          `## Delta context: ${activeArtifactType.id()}\n\n${deltaContextParts.join('\n\n')}`,
        )
      }
    }

    // Part 4: Project artifact rules for active artifact
    if (activeArtifactType !== null) {
      const rules = input.config.artifactRules?.[activeArtifactType.id()]
      if (rules !== undefined && rules.length > 0) {
        const ruleLines = rules.map((r) => `- ${r}`).join('\n')
        parts.push(`## Artifact rules: ${activeArtifactType.id()}\n\n${ruleLines}`)
      }
    }

    // Part 5: Spec content
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
        // Stale/absent metadata: fall back to contextSections extraction
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

        const fallbackParts: string[] = []
        for (const artifactType of schema.artifacts()) {
          if (artifactType.scope() !== 'spec') continue
          const contextSections = artifactType.contextSections()
          if (contextSections.length === 0) continue

          const outputFilename = artifactType.output().split('/').pop()!
          const artifactFile = await specRepo.artifact(spec, outputFilename)
          if (artifactFile === null) continue

          const format = artifactType.format() ?? inferFormat(outputFilename) ?? 'plaintext'
          const parser = this._parsers.get(format)
          if (parser === undefined) continue

          const ast = parser.parse(artifactFile.content)

          for (const section of contextSections) {
            const role = section.role ?? 'context'
            if (!showAll && !sectionsFilter.includes(role as SpecSection)) continue

            const nodes = findNodes(ast.root, section.selector)
            for (const node of nodes) {
              let content: string
              const extract = section.extract ?? 'content'
              if (extract === 'label') {
                content = node.label ?? ''
              } else if (extract === 'both') {
                content = `${node.label ?? ''}\n${parser.renderSubtree(node)}`
              } else {
                content = parser.renderSubtree(node)
              }

              if (!content) continue
              const title = section.contextTitle ?? node.label ?? 'section'
              fallbackParts.push(`**${title}** (${role})\n\n${content}`)
            }
          }
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

    // Part 6: Step hooks (instruction: entries only, pre then post)
    const hookParts: string[] = []

    const collectInstructionHooks = (step: WorkflowStep | null | undefined): void => {
      if (step === null || step === undefined) return
      for (const hook of step.hooks.pre) {
        if (hook.type === 'instruction') hookParts.push(`[pre] ${hook.text}`)
      }
      for (const hook of step.hooks.post) {
        if (hook.type === 'instruction') hookParts.push(`[post] ${hook.text}`)
      }
    }

    // Schema hooks first, then project-level hooks
    collectInstructionHooks(schemaWorkflowStep)
    const configWorkflowStep = input.config.workflow?.find((w) => w.step === input.step)
    collectInstructionHooks(configWorkflowStep)

    if (hookParts.length > 0) {
      parts.push(`## Step hooks: ${input.step}\n\n${hookParts.join('\n')}`)
    }

    // Part 7: Available steps
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
      instructionBlock: parts.join('\n\n---\n\n'),
      warnings,
    }
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

  /**
   * Renders an outline entry list as an indented text summary.
   *
   * @param entries - Outline entries from `ArtifactParser.outline()`
   * @returns Indented text representation
   */
  private _renderOutline(entries: readonly OutlineEntry[]): string {
    const lines: string[] = []
    const render = (items: readonly OutlineEntry[], indent: number): void => {
      for (const item of items) {
        lines.push(`${'  '.repeat(indent)}- ${item.label} (${item.type})`)
        if (item.children) render(item.children, indent + 1)
      }
    }
    render(entries, 0)
    return lines.join('\n')
  }
}
