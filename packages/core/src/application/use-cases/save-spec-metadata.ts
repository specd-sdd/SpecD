import { type SpecRepository } from '../ports/spec-repository.js'
import { type SpecPath } from '../../domain/value-objects/spec-path.js'
import { strictSpecMetadataSchema } from '../../domain/services/parse-metadata.js'
import { MetadataValidationError } from '../../domain/errors/metadata-validation-error.js'
import { DependsOnOverwriteError } from '../../domain/errors/depends-on-overwrite-error.js'
import { WorkspaceNotFoundError } from '../errors/workspace-not-found-error.js'
import { SpecNotFoundError } from '../errors/spec-not-found-error.js'

/** Input for the {@link SaveSpecMetadata} use case. */
export interface SaveSpecMetadataInput {
  /** The workspace name (e.g. `'default'`, `'billing'`). */
  readonly workspace: string
  /** The spec path within the workspace (e.g. `'auth/oauth'`). */
  readonly specPath: SpecPath
  /** Raw JSON string to write as metadata. */
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
 * Writes metadata for a spec.
 *
 * Loads the existing metadata (if any) to obtain its `originalHash` for
 * conflict detection, then delegates to `SpecRepository.saveMetadata()`.
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
    let parsed: unknown
    try {
      parsed = JSON.parse(input.content)
    } catch {
      throw new MetadataValidationError('content must be a JSON object')
    }
    const validation = strictSpecMetadataSchema.safeParse(parsed)
    if (!validation.success) {
      const issues = validation.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')
      throw new MetadataValidationError(issues)
    }

    const repo = this._specRepos.get(input.workspace)
    if (repo === undefined) {
      throw new WorkspaceNotFoundError(input.workspace)
    }

    const spec = await repo.get(input.specPath)
    if (spec === null) {
      throw new SpecNotFoundError(`${input.workspace}:${input.specPath.toFsPath('/')}`)
    }

    // Load existing metadata for conflict detection and dependsOn check
    let originalHash: string | undefined
    if (input.force !== true) {
      const existing = await repo.metadata(spec)
      if (existing !== null) {
        originalHash = existing.originalHash

        // Check if dependsOn would be overwritten
        const existingDeps = existing.dependsOn ?? []
        const incomingDeps = validation.data.dependsOn ?? []
        if (
          existingDeps.length > 0 &&
          !DependsOnOverwriteError.areSame(existingDeps, incomingDeps)
        ) {
          throw new DependsOnOverwriteError(existingDeps, incomingDeps)
        }
      }
    }

    await repo.saveMetadata(
      spec,
      input.content,
      input.force === true
        ? { force: true }
        : originalHash !== undefined
          ? { originalHash }
          : undefined,
    )

    const specLabel = `${input.workspace}:${spec.name.toString()}`
    return { spec: specLabel }
  }
}
