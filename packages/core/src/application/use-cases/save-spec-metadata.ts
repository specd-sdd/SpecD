import { parse as parseYaml } from 'yaml'
import { type SpecRepository } from '../ports/spec-repository.js'
import { type SpecPath } from '../../domain/value-objects/spec-path.js'
import { SpecArtifact } from '../../domain/value-objects/spec-artifact.js'
import { strictSpecMetadataSchema } from '../../domain/services/parse-metadata.js'
import { MetadataValidationError } from '../../domain/errors/metadata-validation-error.js'

/** Input for the {@link SaveSpecMetadata} use case. */
export interface SaveSpecMetadataInput {
  /** The workspace name (e.g. `'default'`, `'billing'`). */
  readonly workspace: string
  /** The spec path within the workspace (e.g. `'auth/oauth'`). */
  readonly specPath: SpecPath
  /** Raw YAML string to write as `.specd-metadata.yaml`. */
  readonly content: string
  /** When `true`, skip conflict detection and overwrite unconditionally. */
  readonly force?: boolean
}

/** Result returned by the {@link SaveSpecMetadata} use case. */
export interface SaveSpecMetadataResult {
  /** The qualified spec label (e.g. `'default:auth/oauth'`). */
  readonly spec: string
}

/**
 * Writes a `.specd-metadata.yaml` file for a spec.
 *
 * Loads the existing artifact (if any) to obtain its `originalHash` for
 * conflict detection, then delegates to `SpecRepository.save()`.
 */
export class SaveSpecMetadata {
  private readonly _specRepos: ReadonlyMap<string, SpecRepository>

  /**
   * Creates a new `SaveSpecMetadata` use case instance.
   *
   * @param specRepos - Map of workspace name to its spec repository
   */
  constructor(specRepos: ReadonlyMap<string, SpecRepository>) {
    this._specRepos = specRepos
  }

  /**
   * Executes the use case.
   *
   * @param input - The metadata content and target spec
   * @returns The spec label on success, or `null` if the spec does not exist
   * @throws {MetadataValidationError} When the content fails structural validation
   * @throws {ArtifactConflictError} When a concurrent modification is detected and `force` is not set
   */
  async execute(input: SaveSpecMetadataInput): Promise<SaveSpecMetadataResult | null> {
    // Validate content against the strict schema before doing anything else
    const parsed = parseYaml(input.content) as unknown
    const validation = strictSpecMetadataSchema.safeParse(parsed ?? {})
    if (!validation.success) {
      const issues = validation.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')
      throw new MetadataValidationError(issues)
    }

    const repo = this._specRepos.get(input.workspace)
    if (repo === undefined) {
      return null
    }

    const spec = await repo.get(input.specPath)
    if (spec === null) {
      return null
    }

    // Load existing metadata artifact for conflict detection hash
    let originalHash: string | undefined
    if (input.force !== true) {
      const existing = await repo.artifact(spec, '.specd-metadata.yaml')
      if (existing !== null) {
        originalHash = existing.originalHash
      }
    }

    const artifact = new SpecArtifact('.specd-metadata.yaml', input.content, originalHash)
    await repo.save(spec, artifact, input.force === true ? { force: true } : {})

    const specLabel = `${input.workspace}:${spec.name.toString()}`
    return { spec: specLabel }
  }
}
