import { type Spec } from '../../domain/entities/spec.js'
import { ArtifactConflictError } from '../../domain/errors/artifact-conflict-error.js'
import { MetadataValidationError } from '../../domain/errors/metadata-validation-error.js'
import { strictSpecMetadataSchema } from '../../domain/services/parse-metadata.js'
import { type MetadataSnapshot, type SpecMetadata } from '../../domain/services/parse-metadata.js'
import { type SpecRepository } from '../ports/spec-repository.js'

/**
 * Internal collaborator that validates and conditionally persists metadata snapshots.
 */
export class PersistSpecMetadata {
  /**
   * Creates the collaborator.
   *
   * @param specRepo - Spec repository for the target workspace
   */
  constructor(private readonly specRepo: SpecRepository) {}

  /**
   * Validates and writes a metadata snapshot with optimistic concurrency.
   *
   * @param input - Persistence input
   * @param input.spec - Target spec entity
   * @param input.metadata - Metadata payload to persist
   * @param input.expectedRevision - Expected snapshot revision for optimistic concurrency
   * @returns Persisted metadata snapshot
   */
  async execute(input: {
    readonly spec: Spec
    readonly metadata: SpecMetadata
    readonly expectedRevision: string | null
  }): Promise<MetadataSnapshot> {
    const validation = strictSpecMetadataSchema.safeParse(input.metadata)
    if (!validation.success) {
      const issues = validation.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')
      throw new MetadataValidationError(issues)
    }

    try {
      return await this.specRepo.writeMetadataSnapshot(input.spec, input.metadata, {
        expectedRevision: input.expectedRevision,
      })
    } catch (error) {
      if (error instanceof ArtifactConflictError) {
        throw error
      }
      throw error
    }
  }
}
