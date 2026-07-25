import { type Spec } from '../../domain/entities/spec.js'
import { ArtifactConflictError } from '../../domain/errors/artifact-conflict-error.js'
import {
  assessMetadataFreshness,
  type SpecMetadataSourceState,
} from '../../domain/services/assess-metadata-freshness.js'
import { computeMetadataFingerprint } from '../../domain/services/metadata-projection.js'
import { type SpecMetadata } from '../../domain/services/parse-metadata.js'
import { parseSpecId } from '../../domain/services/parse-spec-id.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'
import { Logger } from '../logger.js'
import { type ContentHasher } from '../ports/content-hasher.js'
import { type SpecRepository } from '../ports/spec-repository.js'
import { WorkspaceNotFoundError } from '../errors/workspace-not-found-error.js'
import { SpecNotFoundError } from '../errors/spec-not-found-error.js'
import { type GenerateSpecMetadata } from './generate-spec-metadata.js'
import { PersistSpecMetadata } from './persist-spec-metadata.js'

/** Input for {@link MaterializeSpecMetadata}. */
export interface MaterializeSpecMetadataInput {
  readonly specId: string
  readonly policy?: 'if-needed' | 'force'
  /** When true, allow regenerated metadata to change persisted dependsOn. */
  readonly allowDependsOnOverwrite?: boolean
}

/** Warning emitted when metadata cache persistence fails. */
export type SpecMetadataGenerationWarning = {
  readonly kind: 'metadata-cache-write-failed'
  readonly specId: string
  readonly error: string
}

/** Result returned by {@link MaterializeSpecMetadata}. */
export interface MaterializeSpecMetadataResult {
  readonly metadata: SpecMetadata
  readonly metadataFingerprint: string
  readonly source: 'persisted' | 'generated'
  readonly regenerated: boolean
  readonly warnings: readonly SpecMetadataGenerationWarning[]
}

/** Materializes spec metadata from cache or regeneration. */
export class MaterializeSpecMetadata {
  /**
   * Creates the use case.
   *
   * @param specRepositories - Workspace-scoped spec repositories
   * @param generateSpecMetadata - Metadata generation use case
   * @param hasher - Content hasher for metadata fingerprints
   */
  constructor(
    private readonly specRepositories: ReadonlyMap<string, SpecRepository>,
    private readonly generateSpecMetadata: GenerateSpecMetadata,
    private readonly hasher: ContentHasher,
  ) {}

  /**
   * Materializes metadata for a spec.
   *
   * @param input - Target spec identifier and materialization policy
   * @returns Materialized metadata and provenance details
   */
  async execute(input: MaterializeSpecMetadataInput): Promise<MaterializeSpecMetadataResult> {
    const policy = input.policy ?? 'if-needed'
    const { spec, repo } = await this._resolveSpec(input.specId)

    if (policy === 'if-needed') {
      const reused = await this._tryReusePersisted(input.specId, spec, repo)
      if (reused !== null) {
        return reused
      }
    }

    return this._generateAndPersist(
      input.specId,
      spec,
      repo,
      policy,
      input.allowDependsOnOverwrite === true,
    )
  }

  /**
   * Resolves the target spec entity and repository.
   *
   * @param specId - Canonical spec ID
   * @returns Spec entity and owning repository
   */
  private async _resolveSpec(specId: string): Promise<{ spec: Spec; repo: SpecRepository }> {
    const { workspace, capPath } = parseSpecId(specId)
    const repo = this.specRepositories.get(workspace)
    if (repo === undefined) {
      throw new WorkspaceNotFoundError(workspace)
    }

    const spec = await repo.get(SpecPath.parse(capPath))
    if (spec === null) {
      throw new SpecNotFoundError(specId)
    }

    return { spec, repo }
  }

  /**
   * Reuses a fresh persisted metadata snapshot when available.
   *
   * @param specId - Canonical spec ID
   * @param spec - Target spec entity
   * @param repo - Owning spec repository
   * @returns Reused metadata result, or `null` when regeneration is required
   */
  private async _tryReusePersisted(
    specId: string,
    spec: Spec,
    repo: SpecRepository,
  ): Promise<MaterializeSpecMetadataResult | null> {
    const snapshot = await repo.readMetadataSnapshot(spec)
    if (snapshot.kind !== 'present') {
      return null
    }

    const generated = await this.generateSpecMetadata.execute({ specId })
    const assessment = assessMetadataFreshness(snapshot.metadata, generated.sourceState)
    if (!assessment.fresh) {
      return null
    }

    return this._resultFromMetadata(snapshot.metadata, 'persisted', false, [])
  }

  /**
   * Generates metadata and persists it when policy allows.
   *
   * @param specId - Canonical spec ID
   * @param spec - Target spec entity
   * @param repo - Owning spec repository
   * @param policy - Materialization policy
   * @param allowDependsOnOverwrite - Whether regenerated dependsOn may overwrite persisted values
   * @param attempt - Conflict retry counter
   * @returns Generated or reused metadata result
   */
  private async _generateAndPersist(
    specId: string,
    spec: Spec,
    repo: SpecRepository,
    policy: 'if-needed' | 'force',
    allowDependsOnOverwrite = false,
    attempt = 0,
  ): Promise<MaterializeSpecMetadataResult> {
    const initialSnapshot = await repo.readMetadataSnapshot(spec)
    const expectedRevision = initialSnapshot.kind === 'present' ? initialSnapshot.revision : null

    const generated = await this.generateSpecMetadata.execute({
      specId,
      allowDependsOnOverwrite,
    })
    const currentSource = await this._readCurrentSourceState(specId, allowDependsOnOverwrite)
    if (!sourceStatesEqual(generated.sourceState, currentSource)) {
      throw new Error(
        `Metadata source state changed during materialization for '${specId}' — refusing to persist stale projection`,
      )
    }

    const warnings: SpecMetadataGenerationWarning[] = []

    try {
      await new PersistSpecMetadata(repo).execute({
        spec,
        metadata: generated.metadata,
        expectedRevision,
      })
    } catch (error) {
      if (error instanceof ArtifactConflictError) {
        if (attempt >= 1) {
          throw error
        }
        const winner = await repo.readMetadataSnapshot(spec)
        if (winner.kind === 'present') {
          const reassess = assessMetadataFreshness(winner.metadata, generated.sourceState)
          if (reassess.fresh) {
            return this._resultFromMetadata(winner.metadata, 'persisted', false, [])
          }
        }
        return this._generateAndPersist(
          specId,
          spec,
          repo,
          policy,
          allowDependsOnOverwrite,
          attempt + 1,
        )
      }

      const message = error instanceof Error ? error.message : String(error)
      if (policy === 'force') {
        throw error
      }

      warnings.push({
        kind: 'metadata-cache-write-failed',
        specId,
        error: message,
      })
      Logger.warn(`metadata cache write failed for ${specId}: ${message}`)
    }

    return this._resultFromMetadata(generated.metadata, 'generated', true, warnings)
  }

  /**
   * Reads the current metadata source state for a spec.
   *
   * @param specId - Canonical spec ID
   * @param allowDependsOnOverwrite - Whether regenerated dependsOn may overwrite persisted values
   * @returns Current metadata source state
   */
  private async _readCurrentSourceState(
    specId: string,
    allowDependsOnOverwrite: boolean,
  ): Promise<SpecMetadataSourceState> {
    const generated = await this.generateSpecMetadata.execute({
      specId,
      allowDependsOnOverwrite,
    })
    return generated.sourceState
  }

  /**
   * Builds the public materialization result from metadata.
   *
   * @param metadata - Materialized metadata
   * @param source - Whether metadata came from cache or regeneration
   * @param regenerated - Whether metadata was regenerated in this call
   * @param warnings - Non-fatal persistence warnings
   * @returns Materialization result payload
   */
  private _resultFromMetadata(
    metadata: SpecMetadata,
    source: 'persisted' | 'generated',
    regenerated: boolean,
    warnings: readonly SpecMetadataGenerationWarning[],
  ): MaterializeSpecMetadataResult {
    return {
      metadata,
      metadataFingerprint: computeMetadataFingerprint(metadata, this.hasher),
      source,
      regenerated,
      warnings,
    }
  }
}

/**
 * Compares two metadata source states for freshness equivalence.
 *
 * @param left - Left-hand source state
 * @param right - Right-hand source state
 * @returns Whether both states are freshness-equivalent
 */
function sourceStatesEqual(left: SpecMetadataSourceState, right: SpecMetadataSourceState): boolean {
  const leftMetadata: SpecMetadata = {
    provenance: {
      artifacts: left.artifacts,
      persistedStateHash: left.persistedStateHash,
      schema: left.schema,
      projectionVersion: left.projectionVersion,
      projectionFingerprint: left.projectionFingerprint,
    },
  }
  return assessMetadataFreshness(leftMetadata, right).fresh
}
