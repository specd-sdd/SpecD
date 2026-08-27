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
import { type SpecMetadataSourceState } from '../../domain/services/assess-metadata-freshness.js'
import { classifyOptimizationFieldFreshness } from '../../domain/services/spec-optimization-freshness.js'
import {
  type PersistedArtifactState,
  type PersistedSchemaIdentity,
} from '../../domain/services/spec-optimization.js'
import {
  computeProjectionFingerprint,
  METADATA_PROJECTION_VERSION,
} from '../../domain/services/metadata-projection.js'
import { type ArtifactMeta } from '../ports/spec-repository.js'

/** Input for the {@link GenerateSpecMetadata} use case. */
export interface GenerateSpecMetadataInput {
  /** The full spec ID (e.g. `'core/change'` or `'billing:invoices/create'`). */
  readonly specId: string
  /** When true, allow extracted dependsOn to differ from persisted dependsOn. */
  readonly allowDependsOnOverwrite?: boolean
}

/** Result returned by the {@link GenerateSpecMetadata} use case. */
export interface GenerateSpecMetadataResult {
  /** The generated metadata. */
  readonly metadata: SpecMetadata
  /** Whether the schema has `metadataExtraction` declarations. */
  readonly hasExtraction: boolean
  /** Exact source state used for provenance and freshness comparison. */
  readonly sourceState: SpecMetadataSourceState
}

/**
 * Generates metadata content deterministically from schema-declared extraction rules.
 */
export class GenerateSpecMetadata {
  private readonly _listWorkspaces: ListWorkspaces
  private readonly _schemaProvider: SchemaProvider
  private readonly _parsers: ArtifactParserRegistry
  private readonly _hasher: ContentHasher
  private readonly _extractorTransforms: ExtractorTransformRegistry
  private readonly _workspaceRoutes: readonly SpecWorkspaceRoute[]

  /**
   * Creates a new `GenerateSpecMetadata` use case instance.
   *
   * @param listWorkspaces - Project workspace orchestrator
   * @param schemaProvider - Provider for the active schema
   * @param parsers - Artifact parser registry
   * @param hasher - Content hasher for projection fingerprints
   * @param extractorTransforms - Metadata extractor transforms
   * @param workspaceRoutes - Cross-workspace spec reference routes
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
   * Generates metadata for a spec from schema-declared extraction rules.
   *
   * @param input - Target spec identifier
   * @returns Generated metadata and source-state provenance
   */
  async execute(input: GenerateSpecMetadataInput): Promise<GenerateSpecMetadataResult> {
    const schema = await this._schemaProvider.get()
    const extraction = schema.metadataExtraction()
    const projectionFingerprint = computeProjectionFingerprint(
      schema,
      [...this._extractorTransforms.keys()].sort(),
      this._hasher,
    )

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

    const persistedState = await specRepo.readPersistedState(spec)
    const canonical = schema.canonicalSpecSchema()
    const schemaIdentity: PersistedSchemaIdentity = persistedState?.schema ?? {
      name: canonical.name,
      version: canonical.version,
    }

    const artifacts: MetadataArtifactInput[] = []
    const artifactMetaByFilename: Record<string, ArtifactMeta> = {}

    for (const artifactType of schema.artifacts()) {
      if (artifactType.scope !== 'spec') continue

      const filename = path.basename(artifactType.output)
      const format = artifactType.format ?? inferFormat(filename) ?? 'plaintext'
      const parser = this._parsers.get(format)
      if (parser === undefined) continue

      const artifact = await specRepo.artifact(spec, filename)
      if (artifact === null) continue

      const meta = await specRepo.artifactMeta(spec, filename, { includeHash: true })
      if (meta !== null && meta.hash !== undefined) {
        artifactMetaByFilename[filename] = meta
      }

      artifacts.push({
        artifactId: artifactType.id,
        filename,
        format,
        content: artifact.content,
      })
    }

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

    const currentArtifactState = buildArtifactState(artifactMetaByFilename)
    const persistedStateHash =
      persistedState?.originalHash ??
      (await specRepo.persistedStateMeta(spec, { includeHash: true }))?.hash ??
      null

    const dependsOn = resolveCanonicalDependsOn(
      input.specId,
      extracted.metadata.dependsOn,
      persistedState?.dependsOn ?? null,
      input.allowDependsOnOverwrite === true,
    )

    const implementation =
      persistedState !== null && persistedState.implementation.length > 0
        ? projectImplementationMetadata(
            input.specId,
            persistedState.implementation.map((entry) => ({
              file: entry.file,
              ...(entry.symbols !== undefined ? { symbols: entry.symbols } : {}),
            })),
          )
        : undefined

    const freshOptimizations = buildFreshOptimizationProjections(
      persistedState?.optimizations,
      currentArtifactState,
      schemaIdentity,
    )

    const metadata: SpecMetadata = {
      ...extracted.metadata,
      ...(dependsOn !== undefined ? { dependsOn } : {}),
      ...(implementation !== undefined ? { implementation } : {}),
      ...freshOptimizations,
      contentHashes: extracted.contentHashes,
      provenance: {
        artifacts: currentArtifactState,
        persistedStateHash,
        schema: schemaIdentity,
        projectionVersion: METADATA_PROJECTION_VERSION,
        projectionFingerprint,
      },
    }

    const sourceState: SpecMetadataSourceState = {
      artifacts: currentArtifactState,
      persistedStateHash,
      schema: schemaIdentity,
      projectionVersion: METADATA_PROJECTION_VERSION,
      projectionFingerprint,
    }

    return {
      metadata,
      hasExtraction: extraction !== undefined,
      sourceState,
    }
  }
}

/**
 * Builds persisted artifact state from repository metadata.
 *
 * @param artifactMetaByFilename - Artifact metadata keyed by filename
 * @returns Sorted artifact hash state
 */
function buildArtifactState(
  artifactMetaByFilename: Record<string, ArtifactMeta>,
): PersistedArtifactState {
  const sorted = Object.keys(artifactMetaByFilename).sort()
  const state: Record<string, { hash: string; lastModified: string }> = {}
  for (const filename of sorted) {
    const meta = artifactMetaByFilename[filename]!
    state[filename] = { hash: meta.hash!, lastModified: meta.lastModified }
  }
  return state
}

/**
 * Projects fresh optimization fields from persisted durable state.
 *
 * @param optimizations - Persisted optimization payload
 * @param currentArtifactState - Current artifact hash state
 * @param schemaIdentity - Persisted schema identity
 * @returns Fresh optimization metadata fields
 */
function buildFreshOptimizationProjections(
  optimizations:
    | import('../../domain/services/spec-optimization.js').PersistedSpecOptimizations
    | undefined,
  currentArtifactState: PersistedArtifactState,
  schemaIdentity: PersistedSchemaIdentity,
): Pick<SpecMetadata, 'optimizedDescription' | 'optimizedContext' | 'optimizationStatus'> {
  if (optimizations === undefined) {
    return {
      optimizationStatus: {
        optimizedDescription: 'missing',
        optimizedContext: 'missing',
      },
    }
  }

  const result: {
    optimizedDescription?: string
    optimizedContext?: string
    optimizationStatus?: NonNullable<SpecMetadata['optimizationStatus']>
  } = {}

  if (optimizations.optimizedDescription !== undefined) {
    const freshness = classifyOptimizationFieldFreshness(
      optimizations.optimizedDescription,
      currentArtifactState,
      schemaIdentity,
    )
    if (freshness.fresh) {
      result.optimizedDescription = optimizations.optimizedDescription.value
    } else {
      result.optimizationStatus = {
        ...result.optimizationStatus,
        optimizedDescription: 'stale',
      }
    }
  } else {
    result.optimizationStatus = {
      ...result.optimizationStatus,
      optimizedDescription: 'missing',
    }
  }

  if (optimizations.optimizedContext !== undefined) {
    const freshness = classifyOptimizationFieldFreshness(
      optimizations.optimizedContext,
      currentArtifactState,
      schemaIdentity,
    )
    if (freshness.fresh) {
      result.optimizedContext = optimizations.optimizedContext.value
    } else {
      result.optimizationStatus = {
        ...result.optimizationStatus,
        optimizedContext: 'stale',
      }
    }
  } else {
    result.optimizationStatus = {
      ...result.optimizationStatus,
      optimizedContext: 'missing',
    }
  }

  return result
}

/**
 * Resolves canonical `dependsOn` from extracted and persisted baselines.
 *
 * @param _specId - Canonical spec ID (unused; retained for call-site clarity)
 * @param extractedDependsOn - Extracted dependency list
 * @param persistedDependsOn - Persisted dependency baseline
 * @param allowOverwrite - Whether to allow overwriting persisted dependsOn
 * @returns Canonical dependency list
 * @throws {DependsOnOverwriteError} When extracted and persisted dependencies conflict
 */
function resolveCanonicalDependsOn(
  _specId: string,
  extractedDependsOn: readonly string[] | undefined,
  persistedDependsOn: readonly string[] | null,
  allowOverwrite: boolean,
): string[] | undefined {
  if (persistedDependsOn === null) {
    return extractedDependsOn !== undefined ? [...extractedDependsOn] : undefined
  }

  if (
    extractedDependsOn !== undefined &&
    !DependsOnOverwriteError.areSame(extractedDependsOn, persistedDependsOn)
  ) {
    if (allowOverwrite) {
      return [...extractedDependsOn]
    }
    throw new DependsOnOverwriteError([...persistedDependsOn], [...extractedDependsOn])
  }

  return [...persistedDependsOn]
}

/**
 * Projects persisted implementation links into metadata shape.
 *
 * @param specId - Canonical spec ID
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
