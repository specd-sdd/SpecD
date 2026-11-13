import { parseSpecId } from '../../domain/services/parse-spec-id.js'
import { InvalidInputError } from '../../domain/errors/invalid-input-error.js'
import { type GetStatus } from './get-status.js'

/** Input for {@link GetChangeSpecDeps}. */
export interface GetChangeSpecDepsInput {
  /** Change name. */
  readonly name: string
  /** Raw spec ID typed by the caller; bare (`auth/login`) or fully qualified. */
  readonly specId: string
}

/** Result of {@link GetChangeSpecDeps}. */
export interface GetChangeSpecDepsResult {
  /** Change name. */
  readonly name: string
  /** Fully-qualified spec ID, e.g. `default:auth/login`. */
  readonly specId: string
  /** Declared dependencies of the spec in this change (`change.specDependsOn`), in stored order; empty when none are declared. */
  readonly dependsOn: readonly string[]
}

/**
 * Returns the declared dependencies of one spec within a change.
 *
 * Validates and normalizes the spec ID with the configured workspaces, requires the
 * spec to belong to the change (active change or draft), and returns the normalized ID
 * so delivery adapters never parse or qualify spec IDs themselves.
 */
export class GetChangeSpecDeps {
  /**
   * Creates a new `GetChangeSpecDeps` use case instance.
   *
   * @param getStatus - Use case that loads the change or draft and its `specDependsOn`
   * @param workspaces - Configured workspace names used to validate the ID
   */
  constructor(
    private readonly getStatus: GetStatus,
    private readonly workspaces: Iterable<string | { readonly name: string }>,
  ) {}

  /**
   * Returns the declared dependencies of one spec in a change.
   *
   * @param input - Change name and raw spec ID
   * @returns The normalized spec ID and its declared dependencies
   * @throws {InvalidSpecIdError} If `specId` is empty, blank, or malformed
   * @throws {WorkspaceNotFoundError} If the workspace is not configured
   * @throws {ChangeNotFoundError} If the change does not exist
   * @throws {InvalidInputError} If the spec is not in the change's `specIds`
   */
  async execute(input: GetChangeSpecDepsInput): Promise<GetChangeSpecDepsResult> {
    const { specId } = parseSpecId(input.specId, { workspaces: this.workspaces })
    const status = await this.getStatus.execute({ name: input.name })
    const scope = status.change ?? status.draftView
    if (scope === undefined || scope === null || !scope.specIds.includes(specId)) {
      throw new InvalidInputError(`spec '${specId}' is not in the scope of change '${input.name}'`)
    }
    return { name: input.name, specId, dependsOn: [...(status.specDependsOn[specId] ?? [])] }
  }
}
