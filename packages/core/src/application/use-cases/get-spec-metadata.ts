import {
  type MaterializeSpecMetadata,
  type MaterializeSpecMetadataResult,
} from './materialize-spec-metadata.js'

/** Input for {@link GetSpecMetadata}. */
export interface GetSpecMetadataInput {
  readonly specId: string
}

/** Result returned by {@link GetSpecMetadata}. */
export type GetSpecMetadataResult = MaterializeSpecMetadataResult

/** Materializes spec metadata using the `if-needed` policy. */
export class GetSpecMetadata {
  /**
   * Creates the use case.
   *
   * @param materializeSpecMetadata - Metadata materialization use case
   */
  constructor(private readonly materializeSpecMetadata: MaterializeSpecMetadata) {}

  /**
   * Materializes metadata for a spec using the `if-needed` policy.
   *
   * @param input - Target spec identifier
   * @returns Materialized metadata result
   */
  async execute(input: GetSpecMetadataInput): Promise<GetSpecMetadataResult> {
    return this.materializeSpecMetadata.execute({
      specId: input.specId,
      policy: 'if-needed',
    })
  }
}
