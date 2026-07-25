import path from 'node:path'
import { parseSpecId } from '../../domain/services/parse-spec-id.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'
import {
  classifyOptimizationFieldFreshness,
  type PersistedOptimizationStaleReason,
} from '../../domain/services/spec-optimization-freshness.js'
import { type PersistedOptimizationFieldName } from './update-persisted-spec-optimizations.js'
import { type SpecRepository } from '../ports/spec-repository.js'
import { SpecNotFoundError } from '../errors/spec-not-found-error.js'
import { WorkspaceNotFoundError } from '../errors/workspace-not-found-error.js'
import { type GetActiveSchema } from './get-active-schema.js'

/** Input for {@link GetPersistedSpecOptimizations}. */
export interface GetPersistedSpecOptimizationsInput {
  readonly specId: string
  readonly field?: PersistedOptimizationFieldName
}

/** Freshness result for a single persisted optimization field. */
export interface PersistedOptimizationFieldResult {
  readonly value?: string
  readonly freshness: 'fresh' | 'stale' | 'missing'
  readonly reasons: readonly PersistedOptimizationStaleReason[]
}

/** Result returned by {@link GetPersistedSpecOptimizations}. */
export interface GetPersistedSpecOptimizationsResult {
  readonly specId: string
  readonly initialized: boolean
  readonly optimizedDescription?: PersistedOptimizationFieldResult
  readonly optimizedContext?: PersistedOptimizationFieldResult
  readonly fresh: boolean
}

/** Reads persisted optimization fields and evaluates freshness. */
export class GetPersistedSpecOptimizations {
  /**
   * Creates the use case.
   *
   * @param specRepositories - Workspace-scoped spec repositories
   * @param getActiveSchema - Active schema resolver
   */
  constructor(
    private readonly specRepositories: ReadonlyMap<string, SpecRepository>,
    private readonly getActiveSchema: GetActiveSchema,
  ) {}

  /**
   * Reads persisted optimization fields and evaluates freshness.
   *
   * @param input - Target spec identifier and optional field filter
   * @returns Persisted optimization fields with freshness diagnostics
   */
  async execute(
    input: GetPersistedSpecOptimizationsInput,
  ): Promise<GetPersistedSpecOptimizationsResult> {
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
      return { specId: input.specId, initialized: false, fresh: false }
    }

    const schemaResult = await this.getActiveSchema.execute()
    if (schemaResult.raw) throw new Error('schema resolution failed')
    const schema = schemaResult.schema
    const currentArtifactState = await this._currentArtifactState(repo, spec, schema)
    const schemaIdentity = persisted.schema

    const optimizedDescription = this._fieldResult(
      persisted.optimizations?.optimizedDescription,
      currentArtifactState,
      schemaIdentity,
      input.field,
      'optimizedDescription',
    )
    const optimizedContext = this._fieldResult(
      persisted.optimizations?.optimizedContext,
      currentArtifactState,
      schemaIdentity,
      input.field,
      'optimizedContext',
    )

    const includedFields = [optimizedDescription, optimizedContext].filter(
      (field): field is PersistedOptimizationFieldResult => field !== undefined,
    )
    const fresh =
      includedFields.length > 0 && includedFields.every((field) => field.freshness === 'fresh')

    return {
      specId: input.specId,
      initialized: true,
      ...(optimizedDescription !== undefined ? { optimizedDescription } : {}),
      ...(optimizedContext !== undefined ? { optimizedContext } : {}),
      fresh,
    }
  }

  /**
   * Builds a freshness result for one optimization field.
   *
   * @param field - Persisted optimization field value
   * @param currentArtifactState - Current artifact hash state
   * @param schemaIdentity - Persisted schema identity
   * @param filter - Optional field filter from the request
   * @param name - Field name being evaluated
   * @returns Field freshness result, or `undefined` when filtered out
   */
  private _fieldResult(
    field:
      | import('../../domain/services/spec-optimization.js').PersistedOptimizationField
      | undefined,
    currentArtifactState: import('../../domain/services/spec-optimization.js').PersistedArtifactState,
    schemaIdentity: import('../../domain/services/spec-optimization.js').PersistedSchemaIdentity,
    filter: PersistedOptimizationFieldName | undefined,
    name: PersistedOptimizationFieldName,
  ): PersistedOptimizationFieldResult | undefined {
    if (filter !== undefined && filter !== name) return undefined
    if (field === undefined) {
      if (filter === name) {
        return { freshness: 'missing', reasons: ['missing'] }
      }
      return undefined
    }
    const freshness = classifyOptimizationFieldFreshness(
      field,
      currentArtifactState,
      schemaIdentity,
    )
    return {
      value: field.value,
      freshness: freshness.fresh ? 'fresh' : 'stale',
      reasons: freshness.reasons,
    }
  }

  /**
   * Reads current artifact hash state for freshness comparison.
   *
   * @param repo - Spec repository for the target workspace
   * @param spec - Target spec entity
   * @param schema - Active schema
   * @returns Current artifact hash state
   */
  private async _currentArtifactState(
    repo: SpecRepository,
    spec: import('../../domain/entities/spec.js').Spec,
    schema: import('../../domain/value-objects/schema.js').Schema,
  ): Promise<import('../../domain/services/spec-optimization.js').PersistedArtifactState> {
    const state: Record<string, { hash: string; lastModified: string }> = {}
    for (const artifactType of schema.artifacts()) {
      if (artifactType.scope !== 'spec') continue
      const filename = path.basename(artifactType.output)
      const meta = await repo.artifactMeta(spec, filename, { includeHash: true })
      if (meta !== null && meta.hash !== undefined) {
        state[filename] = { hash: meta.hash, lastModified: meta.lastModified }
      }
    }
    return state
  }
}
