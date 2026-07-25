import { applyPersistedSpecStatePatch } from '../../domain/services/apply-persisted-spec-state-patch.js'
import { parseSpecId } from '../../domain/services/parse-spec-id.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'
import { ReadOnlyWorkspaceError } from '../../domain/errors/read-only-workspace-error.js'
import { type ArtifactParserRegistry } from '../ports/artifact-parser.js'
import { type ContentHasher } from '../ports/content-hasher.js'
import { type SpecRepository } from '../ports/spec-repository.js'
import { SpecNotFoundError } from '../errors/spec-not-found-error.js'
import { WorkspaceNotFoundError } from '../errors/workspace-not-found-error.js'
import { type ExtractorTransformRegistry } from '../../domain/services/extract-metadata.js'
import { applyDependsOnMutation } from './_shared/apply-depends-on-mutation.js'
import { resolveInitialPersistedDependsOn } from './resolve-initial-persisted-depends-on.js'
import { type GetActiveSchema } from './get-active-schema.js'

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
   * @returns The resulting dependency list and whether state was created
   * @throws {WorkspaceNotFoundError} If the workspace does not exist
   * @throws {ReadOnlyWorkspaceError} If the workspace is read-only
   * @throws {SpecNotFoundError} If the spec does not exist
   */
  async execute(input: UpdatePersistedSpecDepsInput): Promise<UpdatePersistedSpecDepsResult> {
    const { workspace, capPath } = parseSpecId(input.specId)
    const repo = this.specRepositories.get(workspace)
    if (repo === undefined) {
      throw new WorkspaceNotFoundError(workspace)
    }
    if (repo.ownership() === 'readOnly') {
      throw new ReadOnlyWorkspaceError(workspace)
    }

    const spec = await repo.get(SpecPath.parse(capPath))
    if (spec === null) {
      throw new SpecNotFoundError(input.specId)
    }

    const current = await repo.readPersistedState(spec)
    if (current === null) {
      return this._createMissingState(input, spec, repo)
    }

    const nextDependsOn = applyDependsOnMutation(current.dependsOn, input)
    const state = applyPersistedSpecStatePatch(
      { kind: 'existing', state: current },
      { dependsOn: nextDependsOn },
      { specId: input.specId },
    )
    await repo.writePersistedState(spec, state, { expectedRevision: current.originalHash })
    return { specId: input.specId, dependsOn: nextDependsOn, created: false }
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
      return { specId: input.specId, dependsOn: [], created: false }
    }

    const schemaResult = await this.getActiveSchema.execute()
    if (schemaResult.raw) {
      throw new Error('schema resolution failed')
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
            ...(input.add !== undefined ? { add: input.add } : {}),
          })

    const state = applyPersistedSpecStatePatch(
      { kind: 'initial', schema: schemaIdentity, dependsOn: initialDependsOn },
      { dependsOn },
      { specId: input.specId },
    )
    await repo.writePersistedState(spec, state, { expectedRevision: null })
    return { specId: input.specId, dependsOn, created: true }
  }
}
