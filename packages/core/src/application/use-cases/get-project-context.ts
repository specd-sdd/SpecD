import { createHash } from 'node:crypto'
import { parse as parseYaml } from 'yaml'
import { SchemaNotFoundError } from '../errors/schema-not-found-error.js'
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
import { type Selector } from '../../domain/value-objects/selector.js'
import { inferFormat } from '../../domain/services/format-inference.js'
import { safeRegex } from '../../domain/services/safe-regex.js'
import {
  type CompileContextConfig,
  type ContextWarning,
  type SpecSection,
  shiftHeadings,
} from './compile-context.js'
import { type WorkspaceContext } from '../ports/workspace-context.js'

/** Input for the {@link GetProjectContext} use case. */
export interface GetProjectContextInput extends WorkspaceContext {
  /** Resolved project configuration. */
  readonly config: CompileContextConfig
  /**
   * When `true`, follows `dependsOn` links from `.specd-metadata.yaml` transitively to
   * discover additional specs beyond those matched by include/exclude patterns.
   * When `false` or absent, traversal is not performed.
   */
  readonly followDeps?: boolean
  /**
   * Limits `dependsOn` traversal depth. Only meaningful when `followDeps` is `true`.
   * `1` = direct dependencies only; absent = unlimited.
   */
  readonly depth?: number
  /**
   * When present, restricts the metadata sections rendered per spec to the listed values.
   * When absent, all sections are rendered (description + rules + constraints + scenarios).
   * Project `context:` entries are always rendered in full regardless of this field.
   */
  readonly sections?: ReadonlyArray<SpecSection>
}

/** A single spec entry in the {@link GetProjectContextResult}. */
export interface GetProjectContextSpecEntry {
  /** Workspace name the spec belongs to. */
  readonly workspace: string
  /** Capability path of the spec within the workspace. */
  readonly path: string
  /** Rendered spec content (metadata or fallback). */
  readonly content: string
}

/** Result returned by a successful {@link GetProjectContext} execution. */
export interface GetProjectContextResult {
  /** Rendered project-level context entries (instruction text or file content). */
  readonly contextEntries: string[]
  /** Specs matched by include/exclude patterns across all configured workspaces. */
  readonly specs: GetProjectContextSpecEntry[]
  /** Advisory warnings for missing files, stale metadata, unknown workspaces, etc. */
  readonly warnings: ContextWarning[]
}

/** Internal resolved spec reference. */
interface ResolvedSpec {
  readonly workspace: string
  readonly capPath: string
}

/** Parsed `.specd-metadata.yaml` content. */
interface SpecMetadata {
  readonly title?: string
  readonly description?: string
  readonly keywords?: string[]
  readonly dependsOn?: string[]
  readonly contentHashes?: Record<string, string>
  readonly rules?: Array<{ readonly requirement: string; readonly rules: string[] }>
  readonly constraints?: string[]
  readonly scenarios?: Array<{
    readonly requirement: string
    readonly name: string
    readonly given?: string[]
    readonly when?: string[]
    readonly then?: string[]
  }>
}

/**
 * Compiles the project-level context block without a specific change or lifecycle step.
 *
 * Performs steps 1–4 of the context compilation pipeline (project `context:` entries,
 * project-level include/exclude patterns, workspace-level include/exclude patterns)
 * with ALL configured workspaces treated as active. Step 5 (dependsOn traversal from
 * a change's `contextSpecIds`) is not performed — that requires a specific change.
 */
export class GetProjectContext {
  private readonly _specs: ReadonlyMap<string, SpecRepository>
  private readonly _schemas: SchemaRegistry
  private readonly _files: FileReader
  private readonly _parsers: ArtifactParserRegistry

  /**
   * Creates a new `GetProjectContext` use case instance.
   *
   * @param specs - Spec repositories keyed by workspace name
   * @param schemas - Registry for resolving schema references
   * @param files - Reader for project-level context file entries
   * @param parsers - Registry of artifact format parsers
   */
  constructor(
    specs: ReadonlyMap<string, SpecRepository>,
    schemas: SchemaRegistry,
    files: FileReader,
    parsers: ArtifactParserRegistry,
  ) {
    this._specs = specs
    this._schemas = schemas
    this._files = files
    this._parsers = parsers
  }

  /**
   * Compiles the project-level context for all configured workspaces.
   *
   * @param input - Context compilation parameters (no change required)
   * @returns Assembled context entries, matched specs, and warnings
   * @throws {SchemaNotFoundError} If the schema reference cannot be resolved
   */
  async execute(input: GetProjectContextInput): Promise<GetProjectContextResult> {
    const schema = await this._schemas.resolve(input.schemaRef, input.workspaceSchemasPaths)
    if (schema === null) throw new SchemaNotFoundError(input.schemaRef)

    const warnings: ContextWarning[] = []
    const contextEntries: string[] = []

    // Collect project-level context entries (labelled with their source)
    for (const entry of input.config.context ?? []) {
      if ('instruction' in entry) {
        contextEntries.push(`**Source: instruction**\n\n${entry.instruction}`)
      } else {
        const content = await this._files.read(entry.file)
        if (content === null) {
          warnings.push({
            type: 'missing-file',
            path: entry.file,
            message: `Context file '${entry.file}' not found`,
          })
        } else {
          contextEntries.push(`**Source: ${entry.file}**\n\n${shiftHeadings(content, 1)}`)
        }
      }
    }

    // Steps 1–2: collect included specs using project-level patterns only.
    // Workspace-level patterns are not applied — those are conditional on a specific
    // change having that workspace active and are handled by CompileContext.
    const includedSpecs = new Map<string, ResolvedSpec>()

    // Step 1: Project-level include patterns (bare * = all workspaces)
    for (const pattern of input.config.contextIncludeSpecs ?? []) {
      const matches = await this._listMatchingSpecs(pattern, 'default', true, warnings)
      for (const spec of matches) {
        const key = `${spec.workspace}:${spec.capPath}`
        if (!includedSpecs.has(key)) includedSpecs.set(key, spec)
      }
    }

    // Step 2: Project-level exclude patterns
    const excludedKeys = new Set<string>()
    for (const pattern of input.config.contextExcludeSpecs ?? []) {
      const matches = await this._listMatchingSpecs(pattern, 'default', true, warnings)
      for (const spec of matches) excludedKeys.add(`${spec.workspace}:${spec.capPath}`)
    }
    for (const key of excludedKeys) includedSpecs.delete(key)

    // Step 3 (optional): dependsOn traversal from included specs (only when followDeps is true)
    if (input.followDeps === true) {
      const dependsOnAdded = new Map<string, ResolvedSpec>()
      const depSeen = new Set<string>()
      for (const [key] of includedSpecs) depSeen.add(key)
      for (const { workspace, capPath } of includedSpecs.values()) {
        await this._traverseDependsOn(
          workspace,
          capPath,
          includedSpecs,
          dependsOnAdded,
          depSeen,
          new Set<string>(),
          warnings,
          input.depth,
          0,
        )
      }
      for (const [key, spec] of dependsOnAdded) {
        if (!includedSpecs.has(key)) includedSpecs.set(key, spec)
      }
    }

    // Render spec content for each included spec
    const sectionsFilter = input.sections
    const showAll = sectionsFilter === undefined

    const specs: GetProjectContextSpecEntry[] = []
    for (const { workspace, capPath } of includedSpecs.values()) {
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
      let content: string

      if (isFresh && metadata !== null) {
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
          metaParts.push(
            `#### Constraints\n\n${metadata.constraints.map((c) => `- ${c}`).join('\n')}`,
          )
        }
        if ((showAll || sectionsFilter?.includes('scenarios')) && metadata.scenarios?.length) {
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
        content = `### Spec: ${specLabel}\n\n${metaParts.join('\n\n')}`
      } else {
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
            if (!showAll && !sectionsFilter?.includes(role as SpecSection)) continue

            const nodes = this._findNodes(ast, section.selector)
            for (const node of nodes) {
              let nodeContent: string
              const extract = section.extract ?? 'content'
              if (extract === 'label') {
                nodeContent = node.label ?? ''
              } else if (extract === 'both') {
                nodeContent = `${node.label ?? ''}\n${parser.renderSubtree(node)}`
              } else {
                nodeContent = parser.renderSubtree(node)
              }
              if (!nodeContent) continue
              const title = section.contextTitle ?? node.label ?? 'section'
              fallbackParts.push(`**${title}** (${role})\n\n${nodeContent}`)
            }
          }
        }

        content =
          fallbackParts.length > 0
            ? `### Spec: ${specLabel}\n\n${fallbackParts.join('\n\n')}`
            : `### Spec: ${specLabel}`
      }

      specs.push({ workspace, path: capPath, content })
    }

    return { contextEntries, specs, warnings }
  }

  /**
   * Resolves a glob-like spec pattern to a list of matching specs.
   *
   * @param pattern - Include/exclude pattern (e.g. `"ws:path"` or `"*"`)
   * @param defaultWorkspace - Workspace to use when pattern has no prefix
   * @param allWorkspacesOnBareStar - When `true`, bare `"*"` searches all workspaces
   * @param warnings - Collector for resolution warnings
   * @returns Resolved specs matching the pattern
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
   * Lists capability paths in a single workspace matching a path pattern.
   *
   * @param repo - Spec repository for the target workspace
   * @param pathPat - Path pattern (e.g. `"*"`, `"auth/*"`, or exact path)
   * @param workspace - Workspace name, used for warning messages
   * @param fullPattern - Original full pattern string for diagnostics
   * @param warnings - Collector for resolution warnings
   * @returns Matching capability path strings
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
   * Parses YAML content into a `SpecMetadata` object.
   *
   * @param content - Raw YAML string
   * @returns Parsed metadata, or empty object on parse failure
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
   * Checks whether metadata content hashes match the current artifacts.
   *
   * @param specRepo - Repository to read spec artifacts from
   * @param spec - The spec whose metadata to verify
   * @param metadata - Parsed metadata containing content hashes
   * @returns `true` if all recorded hashes match current artifact content
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
   * Finds all AST nodes matching a selector.
   *
   * @param ast - Parsed artifact AST to search
   * @param selector - Selector criteria to match against
   * @returns Matching nodes
   */
  private _findNodes(ast: ArtifactAST, selector: Selector): ArtifactNode[] {
    const results: ArtifactNode[] = []
    this._collectNodes(ast.root, selector, [], results)
    return results
  }

  /**
   * Recursively collects AST nodes matching a selector.
   *
   * @param node - Current node to test
   * @param selector - Selector criteria to match against
   * @param ancestors - Ancestor chain from root to current node's parent
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
   * Tests whether a single node matches a selector.
   *
   * @param node - Node to test
   * @param selector - Selector with type, matches, contains, and parent criteria
   * @param ancestors - Ancestor chain for parent-based matching
   * @returns `true` if the node satisfies all selector criteria
   */
  private _selectorMatches(
    node: ArtifactNode,
    selector: Selector,
    ancestors: readonly ArtifactNode[],
  ): boolean {
    if (node.type !== selector.type) return false

    if (selector.matches !== undefined) {
      const regex = safeRegex(selector.matches, 'i')
      if (regex === null || !regex.test(node.label ?? '')) return false
    }

    if (selector.contains !== undefined) {
      const regex = safeRegex(selector.contains, 'i')
      if (regex === null || !regex.test(String(node.value ?? ''))) return false
    }

    if (selector.parent !== undefined) {
      const nearestOfType = [...ancestors].reverse().find((a) => a.type === selector.parent!.type)
      if (nearestOfType === undefined) return false
      if (!this._selectorMatches(nearestOfType, selector.parent, [])) return false
    }

    return true
  }

  /**
   * Recursively traverses `dependsOn` links from a spec's metadata.
   *
   * @param workspace - Workspace of the spec to traverse from
   * @param capPath - Capability path of the spec to traverse from
   * @param includedSpecs - Already-included specs (not re-added)
   * @param dependsOnAdded - Accumulator for newly discovered dependency specs
   * @param allSeen - Global set of visited keys to prevent re-processing
   * @param ancestors - Current traversal path for cycle detection
   * @param warnings - Collector for traversal warnings
   * @param maxDepth - Maximum traversal depth, or `undefined` for unlimited
   * @param currentDepth - Current recursion depth
   */
  private async _traverseDependsOn(
    workspace: string,
    capPath: string,
    includedSpecs: Map<string, ResolvedSpec>,
    dependsOnAdded: Map<string, ResolvedSpec>,
    allSeen: Set<string>,
    ancestors: Set<string>,
    warnings: ContextWarning[],
    maxDepth: number | undefined,
    currentDepth: number,
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

    if (maxDepth !== undefined && currentDepth >= maxDepth) return

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
        maxDepth,
        currentDepth + 1,
      )
    }
  }
}
