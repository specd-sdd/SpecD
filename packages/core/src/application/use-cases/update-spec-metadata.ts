import { type SpecMetadata } from '../../domain/services/parse-metadata.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'
import { SpecNotFoundError } from '../errors/spec-not-found-error.js'
import { type GenerateSpecMetadata } from './generate-spec-metadata.js'
import { type SaveSpecMetadata } from './save-spec-metadata.js'

/** Input for the {@link UpdateSpecMetadata} use case. */
export interface UpdateSpecMetadataInput {
  /** The workspace name (e.g. `'default'`, `'billing'`). */
  readonly workspace: string
  /** The capability path (e.g. `'auth/oauth'`). */
  readonly capabilityPath: string
  /** The partial metadata payload containing optimized fields. */
  readonly payload: {
    readonly optimizedDescription?: string
    readonly optimizedContext?: string
  }
}

/** Result returned by the {@link UpdateSpecMetadata} use case. */
export interface UpdateSpecMetadataResult {
  /** The qualified spec label (e.g. `'default:auth/oauth'`). */
  readonly spec: string
}

/**
 * Updates spec metadata by merging LLM-optimized fields with fresh extraction.
 *
 * Algorithm:
 * 1. Perform a fresh deterministic extraction via `GenerateSpecMetadata`.
 * 2. Merge the optimized fields from input into the extracted metadata.
 * 3. Validate and persist the merged result via `SaveSpecMetadata`.
 */
export class UpdateSpecMetadata {
  /**
   * Creates a new `UpdateSpecMetadata` use case.
   *
   * @param _generateMetadata - Use case for fresh deterministic extraction
   * @param _saveMetadata - Use case for persisting the merged result
   */
  constructor(
    private readonly _generateMetadata: GenerateSpecMetadata,
    private readonly _saveMetadata: SaveSpecMetadata,
  ) {}

  /**
   * Executes the metadata update.
   *
   * @param input - Update parameters and optimized payload
   * @returns Result indicating the updated spec label
   * @throws {SpecNotFoundError} If the spec doesn't exist
   */
  async execute(input: UpdateSpecMetadataInput): Promise<UpdateSpecMetadataResult> {
    const specId = `${input.workspace}:${input.capabilityPath}`

    // 1. Fresh deterministic extraction
    const { metadata: deterministic } = await this._generateMetadata.execute({ specId })

    // 2. Merge optimized fields
    const merged: SpecMetadata = {
      ...deterministic,
      ...input.payload,
      generatedBy: 'agent',
    }

    // 3. Save the result
    const result = await this._saveMetadata.execute({
      workspace: input.workspace,
      specPath: SpecPath.parse(input.capabilityPath),
      content: JSON.stringify(merged, null, 2) + '\n',
      force: true, // we want to overwrite with our fresh merge
    })

    if (result === null) {
      throw new SpecNotFoundError(specId)
    }

    return result
  }
}
