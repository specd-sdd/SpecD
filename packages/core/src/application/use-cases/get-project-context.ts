import { type SpecMetadata } from '../../domain/services/parse-metadata.js'
import { parseMetadata } from './_shared/parse-metadata.js'
import { checkMetadataFreshness } from './_shared/metadata-freshness.js'
import { SchemaNotFoundError } from '../errors/schema-not-found-error.js'
import { type SpecRepository } from '../ports/spec-repository.js'
import { type SchemaRegistry } from '../ports/schema-registry.js'
import { type FileReader } from '../ports/file-reader.js'
import { type ArtifactParserRegistry } from '../ports/artifact-parser.js'
import { Spec } from '../../domain/entities/spec.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'
import { inferFormat } from '../../domain/services/format-inference.js'
import {
  type CompileContextConfig,
  type ContextWarning,
  type SpecSection,
} from './compile-context.js'
import { shiftHeadings } from '../../domain/services/shift-headings.js'
import { type ContentHasher } from '../ports/content-hasher.js'
import { findNodes } from './_shared/selector-matching.js'
import { listMatchingSpecs, type ResolvedSpec } from './_shared/spec-pattern-matching.js'
import { traverseDependsOn } from './_shared/depends-on-traversal.js'

/** Input for the {@link GetProjectContext} use case. */
export interface GetProjectContextInput {
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

/**
 * Compiles the project-level context block without a specific change or lifecycle step.
 *
 * Performs steps 1–4 of the context compilation pipeline (project `context:` entries,
 * project-level include/exclude patterns, workspace-level include/exclude patterns)
 * with ALL configured workspaces treated as active. Step 5 (dependsOn traversal from
 * a change's `specIds` dependsOn metadata) is not performed — that requires a specific change.
 */
export class GetProjectContext {
  private readonly _specs: ReadonlyMap<string, SpecRepository>
  private readonly _schemas: SchemaRegistry
  private readonly _files: FileReader
  private readonly _parsers: ArtifactParserRegistry
  private readonly _hasher: ContentHasher
  private readonly _schemaRef: string
  private readonly _workspaceSchemasPaths: ReadonlyMap<string, string>

  /**
   * Creates a new `GetProjectContext` use case instance.
   *
   * @param specs - Spec repositories keyed by workspace name
   * @param schemas - Registry for resolving schema references
   * @param files - Reader for project-level context file entries
   * @param parsers - Registry of artifact format parsers
   * @param hasher - Content hasher for metadata freshness checks
   * @param schemaRef - Schema reference string (e.g. `"@specd/schema-std"`)
   * @param workspaceSchemasPaths - Map of workspace name to absolute schemas directory path
   */
  constructor(
    specs: ReadonlyMap<string, SpecRepository>,
    schemas: SchemaRegistry,
    files: FileReader,
    parsers: ArtifactParserRegistry,
    hasher: ContentHasher,
    schemaRef: string,
    workspaceSchemasPaths: ReadonlyMap<string, string>,
  ) {
    this._specs = specs
    this._schemas = schemas
    this._files = files
    this._parsers = parsers
    this._hasher = hasher
    this._schemaRef = schemaRef
    this._workspaceSchemasPaths = workspaceSchemasPaths
  }

  /**
   * Compiles the project-level context for all configured workspaces.
   *
   * @param input - Context compilation parameters (no change required)
   * @returns Assembled context entries, matched specs, and warnings
   * @throws {SchemaNotFoundError} If the schema reference cannot be resolved
   */
  async execute(input: GetProjectContextInput): Promise<GetProjectContextResult> {
    const schema = await this._schemas.resolve(this._schemaRef, this._workspaceSchemasPaths)
    if (schema === null) throw new SchemaNotFoundError(this._schemaRef)

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
      const matches = await listMatchingSpecs(pattern, 'default', true, this._specs, warnings)
      for (const spec of matches) {
        const key = `${spec.workspace}:${spec.capPath}`
        if (!includedSpecs.has(key)) includedSpecs.set(key, spec)
      }
    }

    // Step 2: Project-level exclude patterns
    const excludedKeys = new Set<string>()
    for (const pattern of input.config.contextExcludeSpecs ?? []) {
      const matches = await listMatchingSpecs(pattern, 'default', true, this._specs, warnings)
      for (const spec of matches) excludedKeys.add(`${spec.workspace}:${spec.capPath}`)
    }
    for (const key of excludedKeys) includedSpecs.delete(key)

    // Step 3 (optional): dependsOn traversal from included specs (only when followDeps is true)
    if (input.followDeps === true) {
      const dependsOnAdded = new Map<string, ResolvedSpec>()
      const depSeen = new Set<string>()
      for (const [key] of includedSpecs) depSeen.add(key)
      for (const { workspace, capPath } of includedSpecs.values()) {
        await traverseDependsOn(
          workspace,
          capPath,
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
        metadata = parseMetadata(metadataArtifact.content)
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
          if (artifactType.scope !== 'spec') continue
          const contextSections = artifactType.contextSections
          if (contextSections.length === 0) continue

          const outputFilename = artifactType.output.split('/').pop()!
          const artifactFile = await specRepo.artifact(spec, outputFilename)
          if (artifactFile === null) continue

          const format = artifactType.format ?? inferFormat(outputFilename) ?? 'plaintext'
          const parser = this._parsers.get(format)
          if (parser === undefined) continue

          const ast = parser.parse(artifactFile.content)
          for (const section of contextSections) {
            const role = section.role ?? 'context'
            if (!showAll && !sectionsFilter?.includes(role as SpecSection)) continue

            const nodes = findNodes(ast.root, section.selector)
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
