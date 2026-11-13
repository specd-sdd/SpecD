import { type Spec } from '../../domain/entities/spec.js'
import { type SpecArtifact } from '../../domain/value-objects/spec-artifact.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'
import { type SpecRepository } from '../ports/spec-repository.js'
import { WorkspaceNotFoundError } from '../errors/workspace-not-found-error.js'
import { SpecNotFoundError } from '../errors/spec-not-found-error.js'
import { parseSpecId } from '../../domain/services/parse-spec-id.js'

/** Input for the {@link GetSpec} use case. */
export interface GetSpecInput {
  /** Raw or fully-qualified spec identifier (validated and normalized). */
  readonly specId: string
}

/** Result returned by the {@link GetSpec} use case. */
export interface GetSpecResult {
  /** Fully-qualified normalized spec ID. */
  readonly specId: string
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
    const { workspace, capPath, specId } = parseSpecId(input.specId, {
      workspaces: this._specRepos.keys(),
    })

    const repo = this._specRepos.get(workspace)
    if (repo === undefined) {
      throw new WorkspaceNotFoundError(workspace)
    }

    const spec = await repo.get(SpecPath.parse(capPath))
    if (spec === null) {
      throw new SpecNotFoundError(specId)
    }

    const artifacts = new Map<string, SpecArtifact>()
    for (const entry of spec.artifacts) {
      const loaded = await repo.artifact(spec, entry.filename)
      if (loaded !== null) {
        artifacts.set(entry.filename, loaded)
      }
    }

    return { specId, spec, artifacts }
  }
}
