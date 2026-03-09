import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { type SpecRepository } from '../ports/spec-repository.js'
import { type SpecPath } from '../../domain/value-objects/spec-path.js'
import { SpecArtifact } from '../../domain/value-objects/spec-artifact.js'

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
 * Invalidates a spec's `.specd-metadata.yaml` by removing its `contentHashes`.
 *
 * Without `contentHashes` the metadata is treated as stale, forcing regeneration
 * on the next metadata pass. All other fields (title, description, rules, etc.)
 * are preserved.
 */
export class InvalidateSpecMetadata {
  private readonly _specRepos: ReadonlyMap<string, SpecRepository>

  /**
   * Creates a new `InvalidateSpecMetadata` use case instance.
   *
   * @param specRepos - Map of workspace name to its spec repository
   */
  constructor(specRepos: ReadonlyMap<string, SpecRepository>) {
    this._specRepos = specRepos
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
      return null
    }

    const spec = await repo.get(input.specPath)
    if (spec === null) {
      return null
    }

    const existing = await repo.artifact(spec, '.specd-metadata.yaml')
    if (existing === null) {
      return null
    }

    const parsed = parseYaml(existing.content) as Record<string, unknown> | null
    if (parsed === null || typeof parsed !== 'object') {
      return null
    }

    delete parsed['contentHashes']
    const content = stringifyYaml(parsed, { lineWidth: 0 })

    const artifact = new SpecArtifact('.specd-metadata.yaml', content)
    await repo.save(spec, artifact, { force: true })

    const specLabel = `${input.workspace}:${spec.name.toString()}`
    return { spec: specLabel }
  }
}
