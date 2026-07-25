import { parseSpecId } from '../../domain/services/parse-spec-id.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'
import { SpecNotInitializedError } from '../../domain/errors/spec-not-initialized-error.js'
import { type SpecRepository } from '../ports/spec-repository.js'
import { SpecNotFoundError } from '../errors/spec-not-found-error.js'
import { WorkspaceNotFoundError } from '../errors/workspace-not-found-error.js'

/** Input for {@link GetPersistedSpecSchema}. */
export interface GetPersistedSpecSchemaInput {
  readonly specId: string
}

/** Result returned by {@link GetPersistedSpecSchema}. */
export interface GetPersistedSpecSchemaResult {
  readonly specId: string
  readonly schema: { readonly name: string; readonly version: number }
}

/** Reads the persisted schema identity for an initialized spec. */
export class GetPersistedSpecSchema {
  /**
   * Creates the use case.
   *
   * @param specRepositories - Workspace-scoped spec repositories
   */
  constructor(private readonly specRepositories: ReadonlyMap<string, SpecRepository>) {}

  /**
   * Reads the persisted schema identity for a spec.
   *
   * @param input - Target spec identifier
   * @returns Persisted schema identity
   */
  async execute(input: GetPersistedSpecSchemaInput): Promise<GetPersistedSpecSchemaResult> {
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
    if (persisted === null) {
      throw new SpecNotInitializedError(input.specId)
    }

    return { specId: input.specId, schema: persisted.schema }
  }
}
