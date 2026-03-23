import { type SpecRepository } from '../ports/spec-repository.js'
import { type YamlSerializer } from '../ports/yaml-serializer.js'
import { type SpecPath } from '../../domain/value-objects/spec-path.js'
import { WorkspaceNotFoundError } from '../errors/workspace-not-found-error.js'
import { SpecNotFoundError } from '../errors/spec-not-found-error.js'

/** Input for the {@link InvalidateSpecMetadata} use case. */
export interface InvalidateSpecMetadataInput {
  /** The workspace name (e.g. `'default'`, `'billing'`). */
  readonly workspace: string
  /** The spec path within the workspace (e.g. `'auth/oauth'`). */
  readonly specPath: SpecPath
}

/** Result returned by the {@link InvalidateSpecMetadata} use case. */
export interface InvalidateSpecMetadataResult {
  /** The qualified spec label (e.g. `'default:auth/oauth'`). */
  readonly spec: string
}

/**
 * Invalidates a spec's metadata by removing its `contentHashes`.
 *
 * Without `contentHashes` the metadata is treated as stale, forcing regeneration
 * on the next metadata pass. All other fields (title, description, rules, etc.)
 * are preserved.
 */
export class InvalidateSpecMetadata {
  private readonly _specRepos: ReadonlyMap<string, SpecRepository>
  private readonly _yaml: YamlSerializer

  /**
   * Creates a new `InvalidateSpecMetadata` use case instance.
   *
   * @param specRepos - Map of workspace name to its spec repository
   * @param yaml - YAML serializer for parsing and stringifying metadata
   */
  constructor(specRepos: ReadonlyMap<string, SpecRepository>, yaml: YamlSerializer) {
    this._specRepos = specRepos
    this._yaml = yaml
  }

  /**
   * Executes the use case.
   *
   * @param input - The target spec to invalidate
   * @returns The spec label on success, or `null` if not applicable
   */
  async execute(input: InvalidateSpecMetadataInput): Promise<InvalidateSpecMetadataResult | null> {
    const repo = this._specRepos.get(input.workspace)
    if (repo === undefined) {
      throw new WorkspaceNotFoundError(input.workspace)
    }

    const spec = await repo.get(input.specPath)
    if (spec === null) {
      throw new SpecNotFoundError(`${input.workspace}:${input.specPath.toFsPath('/')}`)
    }

    const existing = await repo.metadata(spec)
    if (existing === null) {
      return null
    }

    // Remove contentHashes and originalHash, re-serialize the rest
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { contentHashes: _discarded, originalHash: _hash, ...withoutHashes } = existing
    const content = this._yaml.stringify(withoutHashes)

    await repo.saveMetadata(spec, content, { force: true })

    const specLabel = `${input.workspace}:${spec.name.toString()}`
    return { spec: specLabel }
  }
}
