import { parseSpecId } from '../../domain/services/parse-spec-id.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'
import { type SpecRepository } from '../ports/spec-repository.js'
import { SpecNotFoundError } from '../errors/spec-not-found-error.js'
import { WorkspaceNotFoundError } from '../errors/workspace-not-found-error.js'

/** Input for {@link GetPersistedSpecImplementation}. */
export interface GetPersistedSpecImplementationInput {
  readonly specId: string
}

/** Result returned by {@link GetPersistedSpecImplementation}. */
export interface GetPersistedSpecImplementationResult {
  readonly specId: string
  readonly implementation: readonly import('../ports/spec-repository.js').PersistedImplementationLink[]
  readonly initialized: boolean
}

/** Reads persisted implementation links from durable storage. */
export class GetPersistedSpecImplementation {
  /**
   * Creates the use case.
   *
   * @param specRepositories - Workspace-scoped spec repositories
   */
  constructor(private readonly specRepositories: ReadonlyMap<string, SpecRepository>) {}

  /**
   * Reads persisted implementation links for a spec.
   *
   * @param input - Target spec identifier
   * @returns Persisted implementation links and initialization flag
   */
  async execute(
    input: GetPersistedSpecImplementationInput,
  ): Promise<GetPersistedSpecImplementationResult> {
    const { workspace, capPath } = parseSpecId(input.specId)
    const repo = this.specRepositories.get(workspace)
    if (repo === undefined) {
      throw new WorkspaceNotFoundError(workspace)
    }

    const spec = await repo.get(SpecPath.parse(capPath))
    if (spec === null) {
      throw new SpecNotFoundError(input.specId)
    }

    const persisted = await repo.readPersistedState(spec)
    return {
      specId: input.specId,
      implementation: persisted?.implementation ?? [],
      initialized: persisted !== null,
    }
  }
}
