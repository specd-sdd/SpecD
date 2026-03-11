import { extractMetadata, type SubtreeRenderer } from '../../domain/services/extract-metadata.js'
import { type SelectorNode } from '../../domain/services/selector-matching.js'
import { type SpecRepository } from '../ports/spec-repository.js'
import { type SchemaRegistry } from '../ports/schema-registry.js'
import { type ArtifactParserRegistry } from '../ports/artifact-parser.js'
import { type ContentHasher } from '../ports/content-hasher.js'
import { SchemaNotFoundError } from '../errors/schema-not-found-error.js'
import { type SpecMetadata } from '../../domain/services/parse-metadata.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'
import { inferFormat } from '../../domain/services/format-inference.js'
import { parseSpecId } from '../../domain/services/parse-spec-id.js'

/** Input for the {@link GenerateSpecMetadata} use case. */
export interface GenerateSpecMetadataInput {
  /** The full spec ID (e.g. `'core/change'` or `'billing:invoices/create'`). */
  readonly specId: string
}

/** Result returned by the {@link GenerateSpecMetadata} use case. */
export interface GenerateSpecMetadataResult {
  /** The generated metadata. */
  readonly metadata: SpecMetadata
  /** Whether the schema has `metadataExtraction` declarations. */
  readonly hasExtraction: boolean
}

/**
 * Generates `.specd-metadata.yaml` content deterministically from schema-declared
 * extraction rules, without any LLM involvement.
 *
 * Algorithm:
 * 1. Resolve schema; bail if no `metadataExtraction`
 * 2. For each `scope: 'spec'` artifact, load content from `SpecRepository`
 * 3. Parse each into AST via `ArtifactParserRegistry`
 * 4. Build transform map (`resolveSpecPath` resolves relative paths to spec IDs)
 * 5. Call `extractMetadata()`
 * 6. Compute `contentHashes` (SHA-256 per artifact file)
 * 7. Merge extracted + hashes + `generatedBy: 'core'`
 */
export class GenerateSpecMetadata {
  private readonly _specs: ReadonlyMap<string, SpecRepository>
  private readonly _schemas: SchemaRegistry
  private readonly _parsers: ArtifactParserRegistry
  private readonly _hasher: ContentHasher
  private readonly _schemaRef: string
  private readonly _workspaceSchemasPaths: ReadonlyMap<string, string>

  /**
   * Creates a new GenerateSpecMetadata use case instance.
   *
   * @param specs - Spec repositories keyed by workspace name
   * @param schemas - Registry for resolving schema references
   * @param parsers - Registry of artifact format parsers
   * @param hasher - Content hashing service
   * @param schemaRef - The schema reference string to resolve
   * @param workspaceSchemasPaths - Map of workspace names to schema paths
   */
  constructor(
    specs: ReadonlyMap<string, SpecRepository>,
    schemas: SchemaRegistry,
    parsers: ArtifactParserRegistry,
    hasher: ContentHasher,
    schemaRef: string,
    workspaceSchemasPaths: ReadonlyMap<string, string>,
  ) {
    this._specs = specs
    this._schemas = schemas
    this._parsers = parsers
    this._hasher = hasher
    this._schemaRef = schemaRef
    this._workspaceSchemasPaths = workspaceSchemasPaths
  }

  /**
   * Generates metadata for the given spec.
   *
   * @param input - The spec ID to generate metadata for
   * @returns The generated metadata and whether extraction was available
   * @throws {SchemaNotFoundError} If the schema reference cannot be resolved
   */
  async execute(input: GenerateSpecMetadataInput): Promise<GenerateSpecMetadataResult> {
    const schema = await this._schemas.resolve(this._schemaRef, this._workspaceSchemasPaths)
    if (schema === null) throw new SchemaNotFoundError(this._schemaRef)

    const extraction = schema.metadataExtraction()
    if (extraction === undefined) {
      return { metadata: {}, hasExtraction: false }
    }

    const { workspace, capPath } = parseSpecId(input.specId)
    const specRepo = this._specs.get(workspace)
    if (specRepo === undefined) {
      return { metadata: {}, hasExtraction: true }
    }

    const specPath = SpecPath.parse(capPath)
    const spec = await specRepo.get(specPath)
    if (spec === null) {
      return { metadata: {}, hasExtraction: true }
    }

    // Load and parse spec-scoped artifacts
    const astsByArtifact = new Map<string, { root: SelectorNode }>()
    const renderers = new Map<string, SubtreeRenderer>()
    const contentsByFilename = new Map<string, string>()

    for (const artifactType of schema.artifacts()) {
      if (artifactType.scope !== 'spec') continue

      const filename = artifactType.output.split('/').pop()!
      const format = artifactType.format ?? inferFormat(filename) ?? 'plaintext'
      const parser = this._parsers.get(format)
      if (parser === undefined) continue

      const artifact = await specRepo.artifact(spec, filename)
      if (artifact === null) continue

      contentsByFilename.set(filename, artifact.content)

      const ast = parser.parse(artifact.content)
      astsByArtifact.set(artifactType.id, ast)
      renderers.set(artifactType.id, parser as SubtreeRenderer)
    }

    // Build transforms
    const transforms = new Map<string, (values: string[]) => string[]>()
    transforms.set('resolveSpecPath', (values: string[]) =>
      values.map((v) => this._resolveSpecPath(v, capPath)).filter((v): v is string => v !== null),
    )

    // Extract metadata
    const extracted = extractMetadata(extraction, astsByArtifact, renderers, transforms)

    // Compute content hashes
    const contentHashes: Record<string, string> = {}
    for (const [filename, content] of contentsByFilename) {
      contentHashes[filename] = this._hasher.hash(content)
    }

    // Assemble final metadata
    const metadata: SpecMetadata = {
      ...extracted,
      contentHashes,
      generatedBy: 'core',
    }

    return { metadata, hasExtraction: true }
  }

  /**
   * Resolves a relative spec path (e.g. `../artifact-ast/spec.md`) to a spec ID
   * relative to the current spec's capability path.
   *
   * @param relativePath - The relative path from the spec file
   * @param currentCapPath - The current spec's capability path
   * @returns The resolved spec ID, or null if not resolvable
   */
  private _resolveSpecPath(relativePath: string, currentCapPath: string): string | null {
    // Strip anchor fragments
    const cleanPath = relativePath.replace(/#.*$/, '')

    // Match patterns like ../foo/spec.md or ../foo/bar/spec.md
    const match = cleanPath.match(/^\.\.\/(.+?)\/spec\.md$/)
    if (match === null) return null

    // Resolve relative to current spec's parent directory
    const currentParts = currentCapPath.split('/')
    const parentPath = currentParts.slice(0, -1).join('/')
    const resolvedParts = match[1]!.split('/')

    if (parentPath) {
      return `${parentPath}/${resolvedParts.join('/')}`
    }
    return resolvedParts.join('/')
  }
}
