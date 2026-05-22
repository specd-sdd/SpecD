import { type ExtractorTransformRegistry } from '../../domain/services/extract-metadata.js'
import { type SpecRepository } from '../ports/spec-repository.js'
import { type SchemaProvider } from '../ports/schema-provider.js'
import { type ArtifactParserRegistry } from '../ports/artifact-parser.js'
import { type ContentHasher } from '../ports/content-hasher.js'
import { WorkspaceNotFoundError } from '../errors/workspace-not-found-error.js'
import { SpecNotFoundError } from '../errors/spec-not-found-error.js'
import { type SpecMetadata } from '../../domain/services/parse-metadata.js'
import { type SpecLockData } from '../../domain/services/parse-spec-lock.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'
import { inferFormat } from '../../domain/services/format-inference.js'
import { parseSpecId } from '../../domain/services/parse-spec-id.js'
import { type SpecWorkspaceRoute } from './_shared/spec-reference-resolver.js'
import {
  extractMetadataFromSpecArtifacts,
  type MetadataArtifactInput,
} from './_shared/extract-metadata-from-spec-artifacts.js'

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
 * Generates `metadata.json` content deterministically from schema-declared
 * extraction rules, without any LLM involvement.
 *
 * Algorithm:
 * 1. Resolve schema; bail if no `metadataExtraction`
 * 2. For each `scope: 'spec'` artifact, load content from `SpecRepository`
 * 3. Parse each into AST via `ArtifactParserRegistry`
 * 4. Call `extractMetadata()` with the shared extractor transform registry
 * 5. Compute `contentHashes` (SHA-256 per artifact file)
 * 6. Merge extracted + hashes + `generatedBy: 'core'`
 */
export class GenerateSpecMetadata {
  private readonly _specs: ReadonlyMap<string, SpecRepository>
  private readonly _schemaProvider: SchemaProvider
  private readonly _parsers: ArtifactParserRegistry
  private readonly _hasher: ContentHasher
  private readonly _extractorTransforms: ExtractorTransformRegistry
  private readonly _workspaceRoutes: readonly SpecWorkspaceRoute[]

  /**
   * Creates a new GenerateSpecMetadata use case instance.
   *
   * @param specs - Spec repositories keyed by workspace name
   * @param schemaProvider - Provider for the fully-resolved schema
   * @param parsers - Registry of artifact format parsers
   * @param hasher - Content hashing service
   * @param extractorTransforms - Shared extractor transform registry
   * @param workspaceRoutes - Workspace routing metadata for cross-workspace resolution
   */
  constructor(
    specs: ReadonlyMap<string, SpecRepository>,
    schemaProvider: SchemaProvider,
    parsers: ArtifactParserRegistry,
    hasher: ContentHasher,
    extractorTransforms: ExtractorTransformRegistry,
    workspaceRoutes: readonly SpecWorkspaceRoute[] = [],
  ) {
    this._specs = specs
    this._schemaProvider = schemaProvider
    this._parsers = parsers
    this._hasher = hasher
    this._extractorTransforms = extractorTransforms
    this._workspaceRoutes = workspaceRoutes
  }

  /**
   * Generates metadata for the given spec.
   *
   * @param input - The spec ID to generate metadata for
   * @returns The generated metadata and whether extraction was available
   * @throws {SchemaNotFoundError} If the schema reference cannot be resolved
   */
  async execute(input: GenerateSpecMetadataInput): Promise<GenerateSpecMetadataResult> {
    const schema = await this._schemaProvider.get()

    const extraction = schema.metadataExtraction()
    if (extraction === undefined) {
      return { metadata: {}, hasExtraction: false }
    }

    const { workspace, capPath } = parseSpecId(input.specId)
    const specRepo = this._specs.get(workspace)
    if (specRepo === undefined) {
      throw new WorkspaceNotFoundError(workspace)
    }

    const specPath = SpecPath.parse(capPath)
    const spec = await specRepo.get(specPath)
    if (spec === null) {
      throw new SpecNotFoundError(input.specId)
    }

    const artifacts: MetadataArtifactInput[] = []

    for (const artifactType of schema.artifacts()) {
      if (artifactType.scope !== 'spec') continue

      const filename = artifactType.output.split('/').pop()!
      const format = artifactType.format ?? inferFormat(filename) ?? 'plaintext'
      const parser = this._parsers.get(format)
      if (parser === undefined) continue

      const artifact = await specRepo.artifact(spec, filename)
      if (artifact === null) continue

      artifacts.push({
        artifactId: artifactType.id,
        filename,
        format,
        content: artifact.content,
      })
    }

    const extracted = await extractMetadataFromSpecArtifacts({
      effectiveSpecSchema: schema,
      workspace,
      specPath,
      artifacts,
      parsers: this._parsers,
      extractorTransforms: this._extractorTransforms,
      repositories: this._specs,
      workspaceRoutes: this._workspaceRoutes,
      hasher: this._hasher,
    })

    // Assemble final metadata
    const specLock = await specRepo.readSpecLock(spec)
    const metadata: SpecMetadata = {
      ...extracted.metadata,
      ...(specLock !== null
        ? { implementation: projectImplementationMetadata(input.specId, specLock) }
        : {}),
      contentHashes: extracted.contentHashes,
      generatedBy: 'core',
    }

    return { metadata, hasExtraction: true }
  }
}

/**
 * Projects archived implementation data from `spec-lock.json` into metadata shape.
 *
 * @param specId - Owning spec identifier
 * @param specLock - Parsed sidecar payload
 * @returns Metadata implementation projection
 */
function projectImplementationMetadata(
  specId: string,
  specLock: SpecLockData,
): NonNullable<SpecMetadata['implementation']> {
  const files: Array<{ specId: string; file: string }> = []
  const symbols: Array<{ specId: string; file: string; symbol: string }> = []

  for (const entry of specLock.implementation) {
    if (entry.symbols === undefined) {
      files.push({ specId, file: entry.file })
      continue
    }
    for (const symbol of entry.symbols) {
      symbols.push({ specId, file: entry.file, symbol })
    }
  }

  return {
    ...(files.length > 0 ? { files } : {}),
    ...(symbols.length > 0 ? { symbols } : {}),
  }
}
