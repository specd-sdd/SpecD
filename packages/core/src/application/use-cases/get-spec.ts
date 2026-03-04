import { type Spec } from '../../domain/entities/spec.js'
import { type SpecArtifact } from '../../domain/value-objects/spec-artifact.js'
import { type SpecRepository } from '../ports/spec-repository.js'
import { type SpecPath } from '../../domain/value-objects/spec-path.js'

/** Input for the {@link GetSpec} use case. */
export interface GetSpecInput {
  /** The workspace name (e.g. `'default'`, `'billing'`). */
  readonly workspace: string
  /** The spec path within the workspace (e.g. `'auth/oauth'`). */
  readonly specPath: SpecPath
}

/** Result returned by the {@link GetSpec} use case. */
export interface GetSpecResult {
  /** The spec metadata. */
  readonly spec: Spec
  /** Loaded artifact file contents, keyed by filename. */
  readonly artifacts: Map<string, SpecArtifact>
}

/**
 * Loads a spec and all of its artifact files.
 *
 * Returns `null` if the spec does not exist in the given workspace.
 */
export class GetSpec {
  private readonly _specRepos: ReadonlyMap<string, SpecRepository>

  /**
   * Creates a new `GetSpec` use case instance.
   *
   * @param specRepos - Map of workspace name to its spec repository
   */
  constructor(specRepos: ReadonlyMap<string, SpecRepository>) {
    this._specRepos = specRepos
  }

  /**
   * Executes the use case.
   *
   * @param input - Query parameters
   * @returns The spec and its loaded artifacts, or `null` if the spec does not exist
   */
  async execute(input: GetSpecInput): Promise<GetSpecResult | null> {
    const repo = this._specRepos.get(input.workspace)
    if (repo === undefined) {
      return null
    }

    const spec = await repo.get(input.specPath)
    if (spec === null) {
      return null
    }

    const artifacts = new Map<string, SpecArtifact>()
    for (const filename of spec.filenames) {
      const artifact = await repo.artifact(spec, filename)
      if (artifact !== null) {
        artifacts.set(filename, artifact)
      }
    }

    return { spec, artifacts }
  }
}
