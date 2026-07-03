import path from 'node:path'
import { type ExtractorTransformRegistry } from '../../domain/services/extract-metadata.js'
import { type SpecRepository } from '../ports/spec-repository.js'
import { type SchemaProvider } from '../ports/schema-provider.js'
import { type ArtifactParserRegistry } from '../ports/artifact-parser.js'
import { type ContentHasher } from '../ports/content-hasher.js'
import { WorkspaceNotFoundError } from '../errors/workspace-not-found-error.js'
import { SpecNotFoundError } from '../errors/spec-not-found-error.js'
import { type SpecMetadata } from '../../domain/services/parse-metadata.js'
import { DependsOnOverwriteError } from '../../domain/errors/depends-on-overwrite-error.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'
import { inferFormat } from '../../domain/services/format-inference.js'
import { parseSpecId } from '../../domain/services/parse-spec-id.js'
import { type SpecWorkspaceRoute } from './_shared/spec-reference-resolver.js'
import {
  extractMetadataFromSpecArtifacts,
  type MetadataArtifactInput,
} from './_shared/extract-metadata-from-spec-artifacts.js'
import { type ListWorkspaces } from './list-workspaces.js'

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
 * 2. Resolve orchestrated workspaces to find repositories
 * 3. For each `scope: 'spec'` artifact, load content from `SpecRepository`
 * 4. Parse each into AST via `ArtifactParserRegistry`
 * 5. Call `extractMetadata()` with the shared extractor transform registry
 * 6. Compute `contentHashes` (SHA-256 per artifact file)
 * 7. Merge extracted + implementation + hashes + `generatedBy: 'core'`
 */
export class GenerateSpecMetadata {
  private readonly _listWorkspaces: ListWorkspaces
  private readonly _schemaProvider: SchemaProvider
  private readonly _parsers: ArtifactParserRegistry
  private readonly _hasher: ContentHasher
  private readonly _extractorTransforms: ExtractorTransformRegistry
  private readonly _workspaceRoutes: readonly SpecWorkspaceRoute[]

  /**
   * Creates a new GenerateSpecMetadata use case instance.
   *
   * @param listWorkspaces - The project orchestrator
   * @param schemaProvider - Provider for the fully-resolved schema
   * @param parsers - Registry of artifact format parsers
   * @param hasher - Content hashing service
   * @param extractorTransforms - Shared extractor transform registry
   * @param workspaceRoutes - Workspace routing metadata for cross-workspace resolution
   */
  constructor(
    listWorkspaces: ListWorkspaces,
    schemaProvider: SchemaProvider,
    parsers: ArtifactParserRegistry,
    hasher: ContentHasher,
    extractorTransforms: ExtractorTransformRegistry,
    workspaceRoutes: readonly SpecWorkspaceRoute[] = [],
  ) {
    this._listWorkspaces = listWorkspaces
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
    const workspaces = await this._listWorkspaces.execute()
    const workspaceMap = new Map(workspaces.map((ws) => [ws.name, ws]))

    const ws = workspaceMap.get(workspace)
    if (ws === undefined) {
      throw new WorkspaceNotFoundError(workspace)
    }

    const specRepo = ws.specRepo
    const specPath = SpecPath.parse(capPath)
    const spec = await specRepo.get(specPath)
    if (spec === null) {
      throw new SpecNotFoundError(input.specId)
    }

    const artifacts: MetadataArtifactInput[] = []

    for (const artifactType of schema.artifacts()) {
      if (artifactType.scope !== 'spec') continue

      const filename = path.basename(artifactType.output)
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

    // Map ProjectWorkspace to direct repos for extractMetadataFromSpecArtifacts
    const repositories = new Map<string, SpecRepository>()
    for (const w of workspaces) {
      repositories.set(w.name, w.specRepo)
    }

    const extracted = await extractMetadataFromSpecArtifacts({
      effectiveSpecSchema: schema,
      workspace,
      specPath,
      artifacts,
      parsers: this._parsers,
      extractorTransforms: this._extractorTransforms,
      repositories,
      workspaceRoutes: this._workspaceRoutes,
      hasher: this._hasher,
    })

    // Assemble final metadata
    const dependsOn = resolveCanonicalDependsOn(
      input.specId,
      extracted.metadata.dependsOn,
      await specRepo.readPersistedDependsOn(spec),
    )
    const implementation = await specRepo.readPersistedImplementation(spec)
    const metadata: SpecMetadata = {
      ...extracted.metadata,
      ...(dependsOn !== undefined ? { dependsOn } : {}),
      ...(implementation !== null
        ? { implementation: projectImplementationMetadata(input.specId, implementation) }
        : {}),
      contentHashes: extracted.contentHashes,
      generatedBy: 'core',
    }

    return { metadata, hasExtraction: true }
  }
}

/**
 * Resolves the canonical `dependsOn` set for generated metadata.
 *
 * Persisted dependency state wins when present because it is the durable
 * semantic source. Schema extraction is still executed so drift can be
 * surfaced immediately when both sources disagree.
 *
 * @param specId - Spec whose metadata is being generated
 * @param extractedDependsOn - Dependencies extracted from schema artifacts
 * @param persistedDependsOn - Dependencies persisted in `spec-lock.json`
 * @returns Canonical dependency set to emit into metadata, when any exists
 * @throws {Error} If extracted and persisted dependency sets disagree
 */
function resolveCanonicalDependsOn(
  specId: string,
  extractedDependsOn: readonly string[] | undefined,
  persistedDependsOn: readonly string[] | null,
): string[] | undefined {
  if (persistedDependsOn === null) {
    return extractedDependsOn !== undefined ? [...extractedDependsOn] : undefined
  }

  if (
    extractedDependsOn !== undefined &&
    !DependsOnOverwriteError.areSame(extractedDependsOn, persistedDependsOn)
  ) {
    throw new Error(
      `Generated metadata for '${specId}' found extracted dependencies [${extractedDependsOn.join(', ')}] that do not match persisted dependencies [${persistedDependsOn.join(', ')}].`,
    )
  }

  return [...persistedDependsOn]
}

/**
 * Projects archived implementation data into metadata shape.
 *
 * @param specId - Owning spec identifier
 * @param implementation - Persisted implementation links
 * @returns Metadata implementation projection
 */
function projectImplementationMetadata(
  specId: string,
  implementation: readonly { readonly file: string; readonly symbols?: readonly string[] }[],
): NonNullable<SpecMetadata['implementation']> {
  const files: Array<{ specId: string; file: string }> = []
  const symbols: Array<{ specId: string; file: string; symbol: string }> = []

  for (const entry of implementation) {
    if (entry.symbols === undefined || entry.symbols.length === 0) {
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
