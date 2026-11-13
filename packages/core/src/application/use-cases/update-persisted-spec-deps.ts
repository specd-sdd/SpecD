import { applyPersistedSpecStatePatch } from '../../domain/services/apply-persisted-spec-state-patch.js'
import { isFullyQualifiedSpecId, parseSpecId } from '../../domain/services/parse-spec-id.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'
import { InvalidInputError } from '../../domain/errors/invalid-input-error.js'
import { InvalidSpecLockError } from '../../domain/errors/invalid-spec-lock-error.js'
import { ReadOnlyWorkspaceError } from '../../domain/errors/read-only-workspace-error.js'
import { type ArtifactParserRegistry } from '../ports/artifact-parser.js'
import { type ContentHasher } from '../ports/content-hasher.js'
import { type SpecRepository } from '../ports/spec-repository.js'
import { SpecNotFoundError } from '../errors/spec-not-found-error.js'
import { type ExtractorTransformRegistry } from '../../domain/services/extract-metadata.js'
import { applyDependsOnMutation } from './_shared/apply-depends-on-mutation.js'
import { resolveInitialPersistedDependsOn } from './resolve-initial-persisted-depends-on.js'
import { type GetActiveSchema } from './get-active-schema.js'

/**
 * Normalizes a remove entry: valid IDs become fully qualified; invalid IDs are kept as given.
 *
 * @param id - Dependency ID to normalize for removal
 * @param workspaces - Configured workspaces for validation
 * @returns Qualified ID when valid, otherwise the original string
 */
function tryNormalizeDepId(
  id: string,
  workspaces: Iterable<string | { readonly name: string }>,
): string {
  try {
    return parseSpecId(id, { workspaces }).specId
  } catch {
    return id
  }
}

/** Input for the {@link UpdatePersistedSpecDeps} use case. */
export interface UpdatePersistedSpecDepsInput {
  /** Target spec identifier. */
  readonly specId: string
  /** Dependency spec IDs to add. */
  readonly add?: readonly string[]
  /** Dependency spec IDs to remove. */
  readonly remove?: readonly string[]
  /** Replace all dependencies for this spec. */
  readonly set?: readonly string[]
  /** Clear all dependencies. */
  readonly clear?: boolean
}

/** Result returned by a successful {@link UpdatePersistedSpecDeps} execution. */
export interface UpdatePersistedSpecDepsResult {
  /** The spec ID whose dependencies were updated. */
  readonly specId: string
  /** The resulting dependency list after the update. */
  readonly dependsOn: readonly string[]
  /** Whether persisted state was created during the update. */
  readonly created: boolean
  /**
   * Whether persisted state exists for the spec after the call. `false` only when state was
   * missing and the mutation (`remove` alone or `add: []`) did not create it.
   */
  readonly initialized: boolean
}

/**
 * Mutates `dependsOn` in persisted spec state, creating state when needed.
 */
export class UpdatePersistedSpecDeps {
  /**
   * Creates a new `UpdatePersistedSpecDeps` use case instance.
   *
   * @param specRepositories - Spec repositories keyed by workspace name
   * @param getActiveSchema - Use case resolving the active project schema
   * @param resolveInitialPersistedDependsOnDeps - Dependencies for initial dependency resolution
   * @param resolveInitialPersistedDependsOnDeps.parsers - Artifact parser registry
   * @param resolveInitialPersistedDependsOnDeps.extractorTransforms - Metadata extractor transforms
   * @param resolveInitialPersistedDependsOnDeps.hasher - Content hasher for metadata freshness
   */
  constructor(
    private readonly specRepositories: ReadonlyMap<string, SpecRepository>,
    private readonly getActiveSchema: GetActiveSchema,
    private readonly resolveInitialPersistedDependsOnDeps: {
      readonly parsers: ArtifactParserRegistry
      readonly extractorTransforms: ExtractorTransformRegistry
      readonly hasher: ContentHasher
    },
  ) {}

  /**
   * Executes the persisted dependency update.
   *
   * @param input - Update parameters
   * @returns The resulting dependency list, whether state was created, and whether state exists
   * @throws {InvalidInputError} If operations conflict or no operation is specified
   * @throws {InvalidSpecIdError} If `specId`, `add`, or `set` entries fail validation
   * @throws {WorkspaceNotFoundError} If the workspace does not exist
   * @throws {ReadOnlyWorkspaceError} If the workspace is read-only
   * @throws {SpecNotFoundError} If the spec does not exist
   */
  async execute(input: UpdatePersistedSpecDepsInput): Promise<UpdatePersistedSpecDepsResult> {
    if (
      input.set !== undefined &&
      (input.add !== undefined || input.remove !== undefined || input.clear === true)
    ) {
      throw new InvalidInputError('set is mutually exclusive with add, remove, and clear')
    }
    if (input.clear === true && (input.add !== undefined || input.remove !== undefined)) {
      throw new InvalidInputError('clear is mutually exclusive with add and remove')
    }
    if (
      input.set === undefined &&
      input.add === undefined &&
      input.remove === undefined &&
      input.clear !== true
    ) {
      throw new InvalidInputError('at least one of add, remove, set, or clear must be provided')
    }

    const workspaces = [...this.specRepositories.keys()]
    const parsed = parseSpecId(input.specId, { workspaces })
    const specId = parsed.specId
    const { workspace, capPath } = parsed
    const add =
      input.add !== undefined ? input.add.map((id) => parseSpecId(id, { workspaces })) : undefined
    const set =
      input.set !== undefined ? input.set.map((id) => parseSpecId(id, { workspaces })) : undefined

    const repo = this.specRepositories.get(workspace)!
    if (repo.ownership() === 'readOnly') {
      throw ReadOnlyWorkspaceError.forSpec(specId, workspace)
    }

    for (const target of [...(add ?? []), ...(set ?? [])]) {
      const targetRepo = this.specRepositories.get(target.workspace)!
      const targetSpec = await targetRepo.get(SpecPath.parse(target.capPath))
      if (targetSpec === null) {
        throw new SpecNotFoundError(target.specId)
      }
    }

    const remove =
      input.remove !== undefined
        ? input.remove.map((id) => tryNormalizeDepId(id, workspaces))
        : undefined

    const normalizedInput: UpdatePersistedSpecDepsInput = {
      specId,
      ...(add !== undefined ? { add: add.map((p) => p.specId) } : {}),
      ...(remove !== undefined ? { remove } : {}),
      ...(set !== undefined ? { set: set.map((p) => p.specId) } : {}),
      ...(input.clear !== undefined ? { clear: input.clear } : {}),
    }

    const spec = await repo.get(SpecPath.parse(capPath))
    if (spec === null) {
      throw new SpecNotFoundError(specId)
    }

    // remove/set/clear may repair invalid stored dependsOn; add alone stays strict.
    const isRepairOp = input.clear === true || input.set !== undefined || input.remove !== undefined
    const current = await repo.readPersistedState(
      spec,
      isRepairOp ? { lenientDependsOn: true } : undefined,
    )
    if (current === null) {
      return this._createMissingState(normalizedInput, spec, repo)
    }

    // An entry stored as given (for example a bare `auth/shared` in a lock written before IDs were
    // normalized) must be removable by that same string, so a raw match wins over the normalized form.
    const removeAgainstStored =
      normalizedInput.remove !== undefined && input.remove !== undefined
        ? normalizedInput.remove.map((normalized, i) => {
            const raw = input.remove![i]!
            return current.dependsOn.includes(raw) ? raw : normalized
          })
        : undefined
    const nextDependsOn = applyDependsOnMutation(current.dependsOn, {
      ...normalizedInput,
      ...(removeAgainstStored !== undefined ? { remove: removeAgainstStored } : {}),
    })
    for (let i = 0; i < nextDependsOn.length; i++) {
      const entry = nextDependsOn[i]!
      if (!isFullyQualifiedSpecId(entry)) {
        throw new InvalidSpecLockError(
          specId,
          undefined,
          `dependsOn.${i}`,
          'must be a fully-qualified valid spec ID (workspace:capabilityPath)',
        )
      }
    }
    const state = applyPersistedSpecStatePatch(
      { kind: 'existing', state: current },
      { dependsOn: nextDependsOn },
      { specId },
    )
    await repo.writePersistedState(spec, state, { expectedRevision: current.originalHash })
    return { specId, dependsOn: nextDependsOn, created: false, initialized: true }
  }

  /**
   * Creates missing persisted state before applying dependency mutations.
   *
   * @param input - Update parameters
   * @param spec - Resolved spec entity
   * @param repo - Workspace spec repository
   * @returns The mutation result after state creation
   */
  private async _createMissingState(
    input: UpdatePersistedSpecDepsInput,
    spec: import('../../domain/entities/spec.js').Spec,
    repo: SpecRepository,
  ): Promise<UpdatePersistedSpecDepsResult> {
    const createsState =
      input.clear === true ||
      input.set !== undefined ||
      (input.add !== undefined && input.add.length > 0)
    if (!createsState) {
      return { specId: input.specId, dependsOn: [], created: false, initialized: false }
    }

    const schemaResult = await this.getActiveSchema.execute()
    if (schemaResult.raw) {
      throw new InvalidInputError('schema resolution failed')
    }
    const schemaIdentity = {
      name: schemaResult.schema.name(),
      version: schemaResult.schema.version(),
    }

    const initialDependsOn =
      input.set !== undefined || input.clear === true
        ? applyDependsOnMutation([], input)
        : await resolveInitialPersistedDependsOn(
            { specId: input.specId, schema: schemaIdentity },
            {
              specRepo: repo,
              schemaProvider: { get: () => Promise.resolve(schemaResult.schema) },
              parsers: this.resolveInitialPersistedDependsOnDeps.parsers,
              extractorTransforms: this.resolveInitialPersistedDependsOnDeps.extractorTransforms,
              hasher: this.resolveInitialPersistedDependsOnDeps.hasher,
              repositories: this.specRepositories,
            },
          )

    const dependsOn =
      input.set !== undefined || input.clear === true
        ? initialDependsOn
        : applyDependsOnMutation(initialDependsOn, {
            ...(input.remove !== undefined ? { remove: input.remove } : {}),
            ...(input.add !== undefined ? { add: input.add } : {}),
          })

    const state = applyPersistedSpecStatePatch(
      { kind: 'initial', schema: schemaIdentity, dependsOn: initialDependsOn },
      { dependsOn },
      { specId: input.specId },
    )
    await repo.writePersistedState(spec, state, { expectedRevision: null })
    return { specId: input.specId, dependsOn, created: true, initialized: true }
  }
}
