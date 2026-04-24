import * as path from 'node:path'
import { type ArtifactType } from '../value-objects/artifact-type.js'
import { parseSpecId } from './parse-spec-id.js'

/** Input for {@link expectedArtifactFilename}. */
export interface ExpectedArtifactFilenameInput {
  /** The schema artifact type being resolved. */
  readonly artifactType: ArtifactType
  /** Artifact file key (artifact id for scope:change, specId for scope:spec). */
  readonly key: string
  /**
   * Whether the target spec already exists in `SpecRepository`.
   *
   * Only relevant for `scope: 'spec'` artifacts with `delta: true`.
   */
  readonly specExists?: boolean
}

/**
 * Resolves the single expected change-directory filename for an artifact file.
 *
 * @param input - Artifact filename resolution input
 * @param input.artifactType - Schema artifact type
 * @param input.key - File key for this artifact file
 * @param input.specExists - Whether the target spec already exists
 * @returns The expected relative filename inside the change directory
 */
export function expectedArtifactFilename(input: ExpectedArtifactFilenameInput): string {
  const outputBasename = path.basename(input.artifactType.output)
  if (input.artifactType.scope === 'change') {
    return outputBasename
  }

  const { workspace, capPath } = parseSpecId(input.key)
  if (input.artifactType.delta && input.specExists === true) {
    return capPath.length > 0
      ? `deltas/${workspace}/${capPath}/${outputBasename}.delta.yaml`
      : `deltas/${workspace}/${outputBasename}.delta.yaml`
  }

  return capPath.length > 0
    ? `specs/${workspace}/${capPath}/${outputBasename}`
    : `specs/${workspace}/${outputBasename}`
}
