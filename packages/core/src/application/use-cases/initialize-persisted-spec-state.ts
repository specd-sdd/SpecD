import { applyPersistedSpecStatePatch } from '../../domain/services/apply-persisted-spec-state-patch.js'
import { parseSpecId } from '../../domain/services/parse-spec-id.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'
import { SpecAlreadyInitializedError } from '../../domain/errors/spec-already-initialized-error.js'
import { ReadOnlyWorkspaceError } from '../../domain/errors/read-only-workspace-error.js'
import { type Schema } from '../../domain/value-objects/schema.js'
import { type ArtifactParserRegistry } from '../ports/artifact-parser.js'
import { type ContentHasher } from '../ports/content-hasher.js'
import { type SpecRepository } from '../ports/spec-repository.js'
import { SpecNotFoundError } from '../errors/spec-not-found-error.js'
import { WorkspaceNotFoundError } from '../errors/workspace-not-found-error.js'
import { type ExtractorTransformRegistry } from '../../domain/services/extract-metadata.js'
import { type GetActiveSchema } from './get-active-schema.js'
import { type ListWorkspaces } from './list-workspaces.js'
import { resolveInitialPersistedDependsOn } from './resolve-initial-persisted-depends-on.js'

/** Target for persisted spec state initialization. */
export type InitializePersistedSpecStateTarget =
  | { readonly kind: 'spec'; readonly specId: string }
  | { readonly kind: 'all'; readonly workspaces?: readonly string[] }

/** Input for {@link InitializePersistedSpecState}. */
export interface InitializePersistedSpecStateInput {
  readonly target: InitializePersistedSpecStateTarget
  readonly schemaRef?: string
}

/** Result for a single initialized spec. */
export interface InitializePersistedSpecStateSpecResult {
  readonly specId: string
  readonly schema: { readonly name: string; readonly version: number }
  readonly dependsOn: readonly string[]
}

/** Failure entry for batch initialization. */
export interface InitializePersistedSpecStateFailure {
  readonly specId: string
  readonly error: string
}

/** Result returned by {@link InitializePersistedSpecState}. */
export type InitializePersistedSpecStateResult =
  | { readonly kind: 'spec'; readonly initialized: InitializePersistedSpecStateSpecResult }
  | {
      readonly kind: 'batch'
      readonly initialized: readonly InitializePersistedSpecStateSpecResult[]
      readonly failed: readonly InitializePersistedSpecStateFailure[]
      readonly existingSkipped: number
    }

/** Initializes durable spec state for one spec or a workspace batch. */
export class InitializePersistedSpecState {
  /**
   * Creates the use case.
   *
   * @param specRepositories - Workspace-scoped spec repositories
   * @param listWorkspaces - Project workspace orchestrator
   * @param getActiveSchema - Active schema resolver
   * @param resolveInitialPersistedDependsOnDeps - Dependencies for initial dependency resolution
   * @param resolveInitialPersistedDependsOnDeps.parsers - Artifact parser registry
   * @param resolveInitialPersistedDependsOnDeps.extractorTransforms - Metadata extractor transforms
   * @param resolveInitialPersistedDependsOnDeps.hasher - Content hasher
   */
  constructor(
    private readonly specRepositories: ReadonlyMap<string, SpecRepository>,
    private readonly listWorkspaces: ListWorkspaces,
    private readonly getActiveSchema: GetActiveSchema,
    private readonly resolveInitialPersistedDependsOnDeps: {
      readonly parsers: ArtifactParserRegistry
      readonly extractorTransforms: ExtractorTransformRegistry
      readonly hasher: ContentHasher
    },
  ) {}

  /**
   * Initializes durable spec state for the requested target.
   *
   * @param input - Initialization target and optional schema reference
   * @returns Single-spec or batch initialization result
   */
  async execute(
    input: InitializePersistedSpecStateInput,
  ): Promise<InitializePersistedSpecStateResult> {
    const schema = await this._resolveSchema(input.schemaRef)
    const canonical = schema.canonicalSpecSchema()
    const schemaIdentity = { name: canonical.name, version: canonical.version }

    if (input.target.kind === 'spec') {
      const initialized = await this._initializeOne(input.target.specId, schema, schemaIdentity)
      return { kind: 'spec', initialized }
    }

    const workspaces = await this.listWorkspaces.execute()
    const filter =
      input.target.workspaces !== undefined && input.target.workspaces.length > 0
        ? new Set(input.target.workspaces)
        : null

    const initialized: InitializePersistedSpecStateSpecResult[] = []
    const failed: InitializePersistedSpecStateFailure[] = []
    let existingSkipped = 0

    for (const ws of workspaces) {
      if (filter !== null && !filter.has(ws.name)) continue
      const listed = await ws.specRepo.list()
      for (const entry of listed.items) {
        const specId = `${ws.name}:${entry.path}`
        const spec = await ws.specRepo.get(SpecPath.parse(entry.path))
        if (spec === null) continue
        const existing = await ws.specRepo.readPersistedState(spec)
        if (existing !== null) {
          existingSkipped++
          continue
        }
        try {
          initialized.push(await this._initializeOne(specId, schema, schemaIdentity))
        } catch (error) {
          failed.push({
            specId,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
    }

    return { kind: 'batch', initialized, failed, existingSkipped }
  }

  /**
   * Resolves the schema used for initialization.
   *
   * @param schemaRef - Optional schema reference override
   * @returns Resolved schema entity
   */
  private async _resolveSchema(schemaRef?: string): Promise<Schema> {
    const result = await this.getActiveSchema.execute(
      schemaRef !== undefined ? { mode: 'ref', ref: schemaRef } : undefined,
    )
    if (result.raw) {
      throw new Error('initialize persisted state requires a resolved schema')
    }
    return result.schema
  }

  /**
   * Initializes durable state for a single spec.
   *
   * @param specId - Canonical spec ID
   * @param schema - Resolved schema entity
   * @param schemaIdentity - Persisted schema identity
   * @param schemaIdentity.name - Schema name
   * @param schemaIdentity.version - Schema version
   * @returns Initialization summary for the spec
   */
  private async _initializeOne(
    specId: string,
    schema: Schema,
    schemaIdentity: { readonly name: string; readonly version: number },
  ): Promise<InitializePersistedSpecStateSpecResult> {
    const { workspace, capPath } = parseSpecId(specId)
    const repo = this.specRepositories.get(workspace)
    if (repo === undefined) {
      throw new WorkspaceNotFoundError(workspace)
    }
    if (repo.ownership() === 'readOnly') {
      throw new ReadOnlyWorkspaceError(workspace)
    }

    const spec = await repo.get(SpecPath.parse(capPath))
    if (spec === null) {
      throw new SpecNotFoundError(specId)
    }

    const existing = await repo.readPersistedState(spec)
    if (existing !== null) {
      throw new SpecAlreadyInitializedError(specId)
    }

    const dependsOn = await resolveInitialPersistedDependsOn(
      { specId, schema: schemaIdentity },
      {
        specRepo: repo,
        schemaProvider: { get: () => Promise.resolve(schema) },
        parsers: this.resolveInitialPersistedDependsOnDeps.parsers,
        extractorTransforms: this.resolveInitialPersistedDependsOnDeps.extractorTransforms,
        hasher: this.resolveInitialPersistedDependsOnDeps.hasher,
        repositories: this.specRepositories,
      },
    )

    const state = applyPersistedSpecStatePatch(
      { kind: 'initial', schema: schemaIdentity, dependsOn },
      {},
      { specId },
    )

    await repo.writePersistedState(spec, state, { expectedRevision: null })

    return { specId, schema: schemaIdentity, dependsOn }
  }
}
