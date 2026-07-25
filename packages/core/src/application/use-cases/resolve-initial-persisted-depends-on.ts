import path from 'node:path'
import { type SpecRepository } from '../ports/spec-repository.js'
import { type SchemaProvider } from '../ports/schema-provider.js'
import { type ArtifactParserRegistry } from '../ports/artifact-parser.js'
import { type ContentHasher } from '../ports/content-hasher.js'
import { type ExtractorTransformRegistry } from '../../domain/services/extract-metadata.js'
import { parseSpecId } from '../../domain/services/parse-spec-id.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'
import { inferFormat } from '../../domain/services/format-inference.js'
import { SpecNotFoundError } from '../errors/spec-not-found-error.js'
import { type PersistedSchemaIdentity } from '../../domain/services/spec-optimization.js'
import {
  extractMetadataFromSpecArtifacts,
  type MetadataArtifactInput,
} from './_shared/extract-metadata-from-spec-artifacts.js'
import { type SpecWorkspaceRoute } from './_shared/spec-reference-resolver.js'

/** Input for {@link resolveInitialPersistedDependsOn}. */
export interface ResolveInitialPersistedDependsOnInput {
  /** Target spec identifier. */
  readonly specId: string
  /** Persisted schema identity for the spec. */
  readonly schema: PersistedSchemaIdentity
  /** Explicit dependency list that bypasses artifact extraction. */
  readonly explicitDependsOn?: readonly string[]
}

/**
 * Resolves initial persisted dependencies from explicit input or artifact projection.
 *
 * @param input - Resolution parameters
 * @param deps - Repositories and services used for artifact extraction
 * @param deps.specRepo - Repository for the target spec workspace
 * @param deps.schemaProvider - Provider for the effective spec schema
 * @param deps.parsers - Artifact parser registry
 * @param deps.extractorTransforms - Metadata extractor transforms
 * @param deps.hasher - Content hasher for metadata freshness
 * @param deps.workspaceRoutes - Optional cross-workspace routing metadata
 * @param deps.repositories - Optional repository map for dependency resolution
 * @returns Resolved dependency spec IDs
 * @throws {SpecNotFoundError} If the target spec does not exist
 */
export async function resolveInitialPersistedDependsOn(
  input: ResolveInitialPersistedDependsOnInput,
  deps: {
    readonly specRepo: SpecRepository
    readonly schemaProvider: SchemaProvider
    readonly parsers: ArtifactParserRegistry
    readonly extractorTransforms: ExtractorTransformRegistry
    readonly hasher: ContentHasher
    readonly workspaceRoutes?: readonly SpecWorkspaceRoute[]
    readonly repositories?: ReadonlyMap<string, SpecRepository>
  },
): Promise<readonly string[]> {
  if (input.explicitDependsOn !== undefined) {
    return [...input.explicitDependsOn]
  }

  const schema = await deps.schemaProvider.get()
  if (schema.metadataExtraction()?.dependsOn === undefined) {
    return []
  }

  const { workspace, capPath } = parseSpecId(input.specId)
  const specPath = SpecPath.parse(capPath)
  const spec = await deps.specRepo.get(specPath)
  if (spec === null) {
    throw new SpecNotFoundError(input.specId)
  }

  const artifacts: MetadataArtifactInput[] = []
  for (const artifactType of schema.artifacts()) {
    if (artifactType.scope !== 'spec') continue
    const filename = path.basename(artifactType.output)
    const format = artifactType.format ?? inferFormat(filename) ?? 'plaintext'
    const parser = deps.parsers.get(format)
    if (parser === undefined) continue
    const artifact = await deps.specRepo.artifact(spec, filename)
    if (artifact === null) continue
    artifacts.push({
      artifactId: artifactType.id,
      filename,
      format,
      content: artifact.content,
    })
  }

  const repositories = deps.repositories ?? new Map([[workspace, deps.specRepo]])
  const extracted = await extractMetadataFromSpecArtifacts({
    effectiveSpecSchema: schema,
    workspace,
    specPath,
    artifacts,
    parsers: deps.parsers,
    extractorTransforms: deps.extractorTransforms,
    repositories,
    workspaceRoutes: deps.workspaceRoutes ?? [],
    hasher: deps.hasher,
  })

  return extracted.metadata.dependsOn !== undefined ? [...extracted.metadata.dependsOn] : []
}
