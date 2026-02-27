import { createHash } from 'node:crypto'
import { parse as parseYaml } from 'yaml'
import { ChangeNotFoundError } from '../errors/change-not-found-error.js'
import { SchemaNotFoundError } from '../errors/schema-not-found-error.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type SpecRepository } from '../ports/spec-repository.js'
import { type SchemaRegistry } from '../ports/schema-registry.js'
import { type FileReader } from '../ports/file-reader.js'
import {
  type ArtifactParserRegistry,
  type ArtifactNode,
  type ArtifactAST,
} from '../ports/artifact-parser.js'
import { Spec } from '../../domain/entities/spec.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'
import { type WorkflowStep } from '../../domain/value-objects/workflow-step.js'
import { type Selector } from '../../domain/value-objects/selector.js'

/** A single entry in the project-level `context:` list. */
export type ContextEntry = { instruction: string } | { file: string }

/** Per-workspace configuration for context spec selection. */
export interface WorkspaceContextConfig {
  /** Include patterns evaluated only when this workspace is active. */
  contextIncludeSpecs?: string[]
  /** Exclude patterns evaluated only when this workspace is active. */
  contextExcludeSpecs?: string[]
}

/** Project configuration subset used by `CompileContext`. */
export interface CompileContextConfig {
  /** Ordered list of project-level context entries injected verbatim at the top. */
  context?: ContextEntry[]
  /** Project-level include patterns; always applied regardless of active workspace. */
  contextIncludeSpecs?: string[]
  /** Project-level exclude patterns; always applied regardless of active workspace. */
  contextExcludeSpecs?: string[]
  /**
   * Per-artifact additional constraint strings injected below the schema instruction.
   * Keyed by artifact ID.
   */
  artifactRules?: Record<string, string[]>
  /** Project-level workflow hook overrides; merged after schema hooks. */
  workflow?: readonly WorkflowStep[]
  /** Per-workspace context include/exclude patterns. */
  workspaces?: Record<string, WorkspaceContextConfig>
}

/** Input for the {@link CompileContext} use case. */
export interface CompileContextInput {
  /** The change name to compile context for. */
  name: string
  /** The lifecycle step being entered (e.g. `'designing'`, `'implementing'`). */
  step: string
  /**
   * The artifact ID currently being generated. Only applicable to the `designing` step.
   * When present, only this artifact's instruction and rules are injected.
   * When absent, no artifact instructions are injected.
   */
  activeArtifact?: string
  /** Schema reference string from `specd.yaml`. */
  schemaRef: string
  /** Resolved workspace-to-schemas-path map. */
  workspaceSchemasPaths: ReadonlyMap<string, string>
  /** Resolved project configuration. */
  config: CompileContextConfig
}

/** Advisory warning emitted during context compilation. */
export interface ContextWarning {
  /** The warning category. */
  type:
    | 'stale-metadata'
    | 'missing-spec'
    | 'unknown-workspace'
    | 'missing-file'
    | 'cycle'
    | 'missing-parser'
  /** The affected spec path, workspace name, or file path. */
  path?: string
  /** Human-readable description of the warning. */
  message: string
}

/** Result returned by a successful {@link CompileContext} execution. */
export interface CompileContextResult {
  /** Whether the requested step is currently available. */
  stepAvailable: boolean
  /** Artifact IDs blocking the step; empty when `stepAvailable` is `true`. */
  blockingArtifacts: string[]
  /** The fully assembled instruction text to inject into the AI context. */
  instructionBlock: string
  /** Stale metadata warnings and other advisory conditions. */
  warnings: ContextWarning[]
}

/** Internal resolved spec reference. */
interface ResolvedSpec {
  workspace: string
  capPath: string
}

/** Parsed `.specd-metadata.yaml` content. */
interface SpecMetadata {
  title?: string
  description?: string
  keywords?: string[]
  dependsOn?: string[]
  contentHashes?: Record<string, string>
  rules?: Array<{ requirement: string; rules: string[] }>
  constraints?: string[]
  scenarios?: Array<{
    requirement: string
    name: string
    given?: string[]
    when?: string[]
    then?: string[]
  }>
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

  /**
   * Creates a new `CompileContext` use case instance.
   *
   * @param changes - Repository for loading the change
   * @param specs - Spec repositories keyed by workspace name
   * @param schemas - Registry for resolving schema references
   * @param files - Reader for project-level context file entries
   * @param parsers - Registry of artifact format parsers
   */
  constructor(
    changes: ChangeRepository,
    specs: ReadonlyMap<string, SpecRepository>,
    schemas: SchemaRegistry,
    files: FileReader,
    parsers: ArtifactParserRegistry,
  ) {
    this._changes = changes
    this._specs = specs
    this._schemas = schemas
    this._files = files
    this._parsers = parsers
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
      const matches = await this._listMatchingSpecs(pattern, 'default', true, warnings)
      for (const spec of matches) {
        const key = `${spec.workspace}:${spec.capPath}`
        if (!includedSpecs.has(key)) includedSpecs.set(key, spec)
      }
    }

    // Step 2: Project-level exclude patterns
    const projectExcludedKeys = new Set<string>()
    for (const pattern of input.config.contextExcludeSpecs ?? []) {
      const matches = await this._listMatchingSpecs(pattern, 'default', true, warnings)
      for (const spec of matches) {
        projectExcludedKeys.add(`${spec.workspace}:${spec.capPath}`)
      }
    }
    for (const key of projectExcludedKeys) includedSpecs.delete(key)

    // Step 3: Workspace-level include patterns (active workspaces only)
    const activeWorkspaces = new Set(
      change.specIds.map((id) => {
        const idx = id.indexOf('/')
        return idx >= 0 ? id.slice(0, idx) : id
      }),
    )

    for (const [wsName, wsConfig] of Object.entries(input.config.workspaces ?? {})) {
      if (!activeWorkspaces.has(wsName)) continue
      for (const pattern of wsConfig.contextIncludeSpecs ?? []) {
        // At workspace level, unqualified path = that workspace; bare * = just that workspace
        const matches = await this._listMatchingSpecs(pattern, wsName, false, warnings)
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
        const matches = await this._listMatchingSpecs(pattern, wsName, false, warnings)
        for (const spec of matches) {
          includedSpecs.delete(`${spec.workspace}:${spec.capPath}`)
        }
      }
    }

    // Step 5: dependsOn traversal from change.contextSpecIds (immune to exclude rules)
    const dependsOnAdded = new Map<string, ResolvedSpec>()
    const depSeen = new Set<string>()
    for (const specId of change.contextSpecIds) {
      await this._traverseDependsOn(
        'default',
        specId,
        includedSpecs,
        dependsOnAdded,
        depSeen,
        new Set<string>(),
        warnings,
      )
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
        if (change.effectiveStatus(requiredId) !== 'complete') {
          stepAvailable = false
          blockingArtifacts.push(requiredId)
        }
      }
    }

    // --- Assemble instruction block ---
    const parts: string[] = []

    // Part 1: Project context entries
    for (const entry of input.config.context ?? []) {
      if ('instruction' in entry) {
        parts.push(entry.instruction)
      } else {
        const content = await this._files.read(entry.file)
        if (content === null) {
          warnings.push({
            type: 'missing-file',
            path: entry.file,
            message: `Context file '${entry.file}' not found`,
          })
        } else {
          parts.push(content)
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
      const format = activeArtifactType.format() ?? this._inferFormat(activeArtifactType.output())
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
          const { workspace, capPath } = this._parseSpecId(specId)
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
          const artifactFile = await specRepo.artifact(spec, activeArtifactType.output())
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
        metadata = this._parseMetadata(metadataArtifact.content)
        isFresh = await this._isMetadataFresh(specRepo, spec, metadata)
      }

      const specLabel = `${workspace}:${capPath}`

      if (isFresh && metadata !== null) {
        // Fresh metadata path
        const metaParts: string[] = []
        if (metadata.description !== undefined) {
          metaParts.push(`**Description:** ${metadata.description}`)
        }
        if (metadata.rules !== undefined && metadata.rules.length > 0) {
          const rulesText = metadata.rules
            .map((r) => `#### ${r.requirement}\n${r.rules.map((rule) => `- ${rule}`).join('\n')}`)
            .join('\n\n')
          metaParts.push(`### Rules\n\n${rulesText}`)
        }
        if (metadata.constraints !== undefined && metadata.constraints.length > 0) {
          const constraintsText = metadata.constraints.map((c) => `- ${c}`).join('\n')
          metaParts.push(`### Constraints\n\n${constraintsText}`)
        }
        if (metadata.scenarios !== undefined && metadata.scenarios.length > 0) {
          const scenariosText = metadata.scenarios
            .map((s) => {
              const lines: string[] = [
                `#### Scenario: ${s.name}`,
                `*Requirement: ${s.requirement}*`,
              ]
              if (s.given?.length) lines.push(`**Given:** ${s.given.join('; ')}`)
              if (s.when?.length) lines.push(`**When:** ${s.when.join('; ')}`)
              if (s.then?.length) lines.push(`**Then:** ${s.then.join('; ')}`)
              return lines.join('\n')
            })
            .join('\n\n')
          metaParts.push(`### Scenarios\n\n${scenariosText}`)
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
          const sections = artifactType.contextSections()
          if (sections.length === 0) continue

          const artifactFile = await specRepo.artifact(spec, artifactType.output())
          if (artifactFile === null) continue

          const format = artifactType.format() ?? this._inferFormat(artifactType.output())
          const parser = this._parsers.get(format)
          if (parser === undefined) continue

          const ast = parser.parse(artifactFile.content)

          for (const section of sections) {
            const nodes = this._findNodes(ast, section.selector)
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
              const role = section.role ?? 'context'
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
      parts.push(`## Spec content\n\n${specContentParts.join('\n\n')}`)
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
        if (change.effectiveStatus(requiredId) !== 'complete') {
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
      instructionBlock: parts.join('\n\n'),
      warnings,
    }
  }

  /**
   * Lists all spec paths matching a glob-like pattern within the appropriate workspace(s).
   *
   * Pattern syntax: `[workspace:]path[/*]`
   * - `*` → all specs (workspace depends on `allWorkspacesOnBareStar`)
   * - `workspace:*` → all specs in named workspace
   * - `prefix/*` → all specs under prefix in `defaultWorkspace`
   * - `workspace:prefix/*` → all specs under prefix in named workspace
   * - `path/name` → exact spec in `defaultWorkspace`
   * - `workspace:path/name` → exact spec in named workspace
   *
   * @param pattern - The include/exclude pattern
   * @param defaultWorkspace - Workspace to use for unqualified paths
   * @param allWorkspacesOnBareStar - When `true`, bare `*` matches all workspaces
   * @param warnings - Accumulator for advisory warnings
   * @returns Resolved spec references matching the pattern
   */
  private async _listMatchingSpecs(
    pattern: string,
    defaultWorkspace: string,
    allWorkspacesOnBareStar: boolean,
    warnings: ContextWarning[],
  ): Promise<ResolvedSpec[]> {
    const colonIdx = pattern.indexOf(':')
    let wsName: string
    let pathPat: string

    if (colonIdx >= 0) {
      wsName = pattern.slice(0, colonIdx)
      pathPat = pattern.slice(colonIdx + 1)
    } else if (pattern === '*' && allWorkspacesOnBareStar) {
      wsName = 'ALL'
      pathPat = '*'
    } else {
      wsName = defaultWorkspace
      pathPat = pattern
    }

    const workspacesToSearch: Array<{ name: string; repo: SpecRepository }> = []

    if (wsName === 'ALL') {
      for (const [name, repo] of this._specs) {
        workspacesToSearch.push({ name, repo })
      }
    } else {
      const repo = this._specs.get(wsName)
      if (repo === undefined) {
        warnings.push({
          type: 'unknown-workspace',
          path: wsName,
          message: `Unknown workspace '${wsName}' in pattern '${pattern}'`,
        })
        return []
      }
      workspacesToSearch.push({ name: wsName, repo })
    }

    const results: ResolvedSpec[] = []
    for (const { name: ws, repo } of workspacesToSearch) {
      const capPaths = await this._listByPattern(repo, pathPat, ws, pattern, warnings)
      for (const capPath of capPaths) {
        results.push({ workspace: ws, capPath })
      }
    }
    return results
  }

  /**
   * Returns spec capability paths matching `pathPat` within a single workspace repo.
   *
   * @param repo - The spec repository to search
   * @param pathPat - Path pattern: `'*'`, `'prefix/*'`, or `'exact/path'`
   * @param workspace - Workspace name (for warning messages)
   * @param fullPattern - The original full pattern (for warning messages)
   * @param warnings - Accumulator for advisory warnings
   * @returns Array of matching capability paths
   */
  private async _listByPattern(
    repo: SpecRepository,
    pathPat: string,
    workspace: string,
    fullPattern: string,
    warnings: ContextWarning[],
  ): Promise<string[]> {
    if (pathPat === '*') {
      const specs = await repo.list()
      return specs.map((s) => s.name.toString())
    }

    if (pathPat.endsWith('/*')) {
      const prefix = pathPat.slice(0, -2)
      try {
        const prefixPath = SpecPath.parse(prefix)
        const specs = await repo.list(prefixPath)
        return specs.map((s) => s.name.toString())
      } catch {
        warnings.push({
          type: 'missing-spec',
          path: `${workspace}:${pathPat}`,
          message: `Invalid prefix in pattern '${fullPattern}'`,
        })
        return []
      }
    }

    // Exact path
    try {
      const specPath = SpecPath.parse(pathPat)
      const spec = await repo.get(specPath)
      if (spec === null) {
        warnings.push({
          type: 'missing-spec',
          path: `${workspace}:${pathPat}`,
          message: `Spec '${workspace}:${pathPat}' not found`,
        })
        return []
      }
      return [spec.name.toString()]
    } catch {
      warnings.push({
        type: 'missing-spec',
        path: `${workspace}:${pathPat}`,
        message: `Invalid path in pattern '${fullPattern}'`,
      })
      return []
    }
  }

  /**
   * Recursively follows `dependsOn` links from a spec's `.specd-metadata.yaml`,
   * adding newly discovered specs to `dependsOnAdded`. Uses DFS with ancestor
   * tracking to detect and break cycles.
   *
   * @param workspace - The workspace of the spec to process
   * @param capPath - The capability path of the spec to process
   * @param includedSpecs - Specs already included via steps 1–4 (not re-added)
   * @param dependsOnAdded - Accumulates specs found only via dependsOn traversal
   * @param allSeen - All spec keys ever visited (prevents re-processing)
   * @param ancestors - Current DFS ancestry set for cycle detection
   * @param warnings - Accumulator for advisory warnings
   */
  private async _traverseDependsOn(
    workspace: string,
    capPath: string,
    includedSpecs: Map<string, ResolvedSpec>,
    dependsOnAdded: Map<string, ResolvedSpec>,
    allSeen: Set<string>,
    ancestors: Set<string>,
    warnings: ContextWarning[],
  ): Promise<void> {
    const key = `${workspace}:${capPath}`

    if (ancestors.has(key)) {
      warnings.push({
        type: 'cycle',
        path: key,
        message: `Cycle detected in dependsOn traversal at '${key}'`,
      })
      return
    }

    if (allSeen.has(key)) return
    allSeen.add(key)

    if (!includedSpecs.has(key)) {
      dependsOnAdded.set(key, { workspace, capPath })
    }

    const specRepo = this._specs.get(workspace)
    if (specRepo === undefined) {
      warnings.push({
        type: 'unknown-workspace',
        path: workspace,
        message: `Unknown workspace '${workspace}' in dependsOn traversal`,
      })
      return
    }

    let specPathObj: SpecPath
    try {
      specPathObj = SpecPath.parse(capPath)
    } catch {
      return
    }

    const spec = new Spec(workspace, specPathObj, [])
    const metadataArtifact = await specRepo.artifact(spec, '.specd-metadata.yaml')
    if (metadataArtifact === null) return

    const metadata = this._parseMetadata(metadataArtifact.content)
    const newAncestors = new Set([...ancestors, key])

    for (const dep of metadata.dependsOn ?? []) {
      const colonIdx = dep.indexOf(':')
      const depWorkspace = colonIdx >= 0 ? dep.slice(0, colonIdx) : workspace
      const depCapPath = colonIdx >= 0 ? dep.slice(colonIdx + 1) : dep

      await this._traverseDependsOn(
        depWorkspace,
        depCapPath,
        includedSpecs,
        dependsOnAdded,
        allSeen,
        newAncestors,
        warnings,
      )
    }
  }

  /**
   * Parses a `.specd-metadata.yaml` content string into a `SpecMetadata` object.
   * Returns an empty object on parse failure.
   *
   * @param content - The YAML content of the metadata file
   * @returns Parsed metadata
   */
  private _parseMetadata(content: string): SpecMetadata {
    try {
      const parsed = parseYaml(content) as unknown
      return (parsed as SpecMetadata) ?? {}
    } catch {
      return {}
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
    const hashes = metadata.contentHashes
    if (hashes === undefined || Object.keys(hashes).length === 0) return false

    for (const [filename, recordedHash] of Object.entries(hashes)) {
      const artifact = await specRepo.artifact(spec, filename)
      if (artifact === null) return false

      const actualHash = `sha256:${createHash('sha256').update(artifact.content).digest('hex')}`
      if (actualHash !== recordedHash) return false
    }
    return true
  }

  /**
   * Finds all AST nodes matching the given selector within an artifact AST.
   *
   * @param ast - The artifact AST to search
   * @param selector - The selector criteria to match against
   * @returns All matching nodes in document order
   */
  private _findNodes(ast: ArtifactAST, selector: Selector): ArtifactNode[] {
    const results: ArtifactNode[] = []
    this._collectNodes(ast.root, selector, [], results)
    return results
  }

  /**
   * Recursively collects nodes matching the selector, tracking the ancestor chain.
   *
   * @param node - Current node being evaluated
   * @param selector - Selector to match
   * @param ancestors - Ordered list of ancestor nodes (root to parent)
   * @param results - Accumulator for matched nodes
   */
  private _collectNodes(
    node: ArtifactNode,
    selector: Selector,
    ancestors: readonly ArtifactNode[],
    results: ArtifactNode[],
  ): void {
    if (this._selectorMatches(node, selector, ancestors)) {
      results.push(node)
    }
    const newAncestors = [...ancestors, node]
    for (const child of node.children ?? []) {
      this._collectNodes(child, selector, newAncestors, results)
    }
  }

  /**
   * Returns `true` if `node` matches all criteria in `selector`.
   *
   * @param node - The node to evaluate
   * @param selector - The selector criteria
   * @param ancestors - Ancestor nodes from root to the node's parent
   * @returns Whether the node matches
   */
  private _selectorMatches(
    node: ArtifactNode,
    selector: Selector,
    ancestors: readonly ArtifactNode[],
  ): boolean {
    if (node.type !== selector.type) return false

    if (selector.matches !== undefined) {
      const regex = new RegExp(selector.matches, 'i')
      if (!regex.test(node.label ?? '')) return false
    }

    if (selector.contains !== undefined) {
      const regex = new RegExp(selector.contains, 'i')
      if (!regex.test(String(node.value ?? ''))) return false
    }

    if (selector.parent !== undefined) {
      // Find the nearest ancestor whose type matches the parent selector's type
      const nearestOfType = [...ancestors].reverse().find((a) => a.type === selector.parent!.type)
      if (nearestOfType === undefined) return false
      if (!this._selectorMatches(nearestOfType, selector.parent, [])) return false
    }

    return true
  }

  /**
   * Renders an outline entry list as an indented text summary.
   *
   * @param entries - Outline entries from `ArtifactParser.outline()`
   * @returns Indented text representation
   */
  private _renderOutline(
    entries: readonly import('../ports/artifact-parser.js').OutlineEntry[],
  ): string {
    const lines: string[] = []
    const render = (
      items: readonly import('../ports/artifact-parser.js').OutlineEntry[],
      indent: number,
    ): void => {
      for (const item of items) {
        lines.push(`${'  '.repeat(indent)}- ${item.label} (${item.type})`)
        if (item.children) render(item.children, indent + 1)
      }
    }
    render(entries, 0)
    return lines.join('\n')
  }

  /**
   * Splits a `workspace/capPath` spec ID into its components.
   *
   * @param specId - Spec ID in `workspace/capPath` format
   * @returns The workspace and capability path
   */
  private _parseSpecId(specId: string): { workspace: string; capPath: string } {
    const slashIdx = specId.indexOf('/')
    return slashIdx >= 0
      ? { workspace: specId.slice(0, slashIdx), capPath: specId.slice(slashIdx + 1) }
      : { workspace: specId, capPath: '' }
  }

  /**
   * Infers the format name from an output filename extension.
   *
   * @param output - The artifact output filename
   * @returns The inferred format name
   */
  private _inferFormat(output: string): string {
    const ext = output.split('.').pop() ?? ''
    if (ext === 'md') return 'markdown'
    if (ext === 'json') return 'json'
    if (ext === 'yaml' || ext === 'yml') return 'yaml'
    return 'plaintext'
  }
}
