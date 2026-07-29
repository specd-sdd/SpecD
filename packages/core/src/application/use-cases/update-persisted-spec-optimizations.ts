import path from 'node:path'
import { z } from 'zod'
import { applyPersistedSpecStatePatch } from '../../domain/services/apply-persisted-spec-state-patch.js'
import { parseSpecId } from '../../domain/services/parse-spec-id.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'
import { InvalidInputError } from '../../domain/errors/index.js'
import { ReadOnlyWorkspaceError } from '../../domain/errors/read-only-workspace-error.js'
import {
  normalizeArtifactState,
  type PersistedSpecOptimizations,
} from '../../domain/services/spec-optimization.js'
import { type ArtifactParserRegistry } from '../ports/artifact-parser.js'
import { type ContentHasher } from '../ports/content-hasher.js'
import { type SpecRepository } from '../ports/spec-repository.js'
import { SpecNotFoundError } from '../errors/spec-not-found-error.js'
import { WorkspaceNotFoundError } from '../errors/workspace-not-found-error.js'
import { type ExtractorTransformRegistry } from '../../domain/services/extract-metadata.js'
import { resolveInitialPersistedDependsOn } from './resolve-initial-persisted-depends-on.js'
import { type GetActiveSchema } from './get-active-schema.js'

/** Persisted optimization field names supported by {@link UpdatePersistedSpecOptimizations}. */
export type PersistedOptimizationFieldName = 'optimizedDescription' | 'optimizedContext'

const optimizationFieldNameSchema = z.enum(['optimizedDescription', 'optimizedContext'])

const optimizationSetSchema = z
  .object({
    optimizedDescription: z.string().optional(),
    optimizedContext: z.string().optional(),
  })
  .strict()
  .refine(
    (value) => value.optimizedDescription !== undefined || value.optimizedContext !== undefined,
    {
      message: 'must include at least one field',
    },
  )

const updatePersistedSpecOptimizationsInputSchema = z
  .object({
    specId: z.string().min(1),
    set: optimizationSetSchema.optional(),
    clear: z.array(optimizationFieldNameSchema).nonempty().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.set !== undefined && value.clear !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['set'],
        message: 'must not be provided when clear is present',
      })
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['clear'],
        message: 'must not be provided when set is present',
      })
    }
    if (value.set === undefined && value.clear === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'must include exactly one of set or clear',
      })
    }
  })

/** Input for the {@link UpdatePersistedSpecOptimizations} use case. */
export interface UpdatePersistedSpecOptimizationsInput {
  /** Target spec identifier. */
  readonly specId: string
  /** Optimization field values to set. */
  readonly set?: Partial<Record<PersistedOptimizationFieldName, string>>
  /** Optimization fields to clear. */
  readonly clear?: readonly PersistedOptimizationFieldName[]
}

/** Result returned by a successful {@link UpdatePersistedSpecOptimizations} execution. */
export interface UpdatePersistedSpecOptimizationsResult {
  /** The spec ID whose optimizations were updated. */
  readonly specId: string
  /** Projected optimization values after the update. */
  readonly optimizations?: Readonly<Record<PersistedOptimizationFieldName, string>>
  /** Whether persisted state was created during the update. */
  readonly created: boolean
}

/** Strictly validated runtime input used after Zod parsing succeeds. */
type ParsedUpdatePersistedSpecOptimizationsInput = {
  readonly specId: string
  readonly set?:
    | {
        readonly optimizedDescription?: string | undefined
        readonly optimizedContext?: string | undefined
      }
    | undefined
  readonly clear?: readonly PersistedOptimizationFieldName[] | undefined
}

/**
 * Validates untrusted runtime input for persisted optimization mutations.
 *
 * @param input - Raw caller input
 * @returns Strictly validated mutation input
 * @throws {InvalidInputError} When the payload shape is invalid
 */
function parseUpdatePersistedSpecOptimizationsInput(
  input: UpdatePersistedSpecOptimizationsInput,
): ParsedUpdatePersistedSpecOptimizationsInput {
  const result = updatePersistedSpecOptimizationsInputSchema.safeParse(input)
  if (result.success) {
    return {
      specId: result.data.specId,
      ...(result.data.set !== undefined ? { set: result.data.set } : {}),
      ...(result.data.clear !== undefined ? { clear: result.data.clear } : {}),
    }
  }

  const issues = result.error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : 'input'
      return `${path}: ${issue.message}`
    })
    .join('; ')
  throw new InvalidInputError(`Invalid persisted optimization update: ${issues}`)
}

/**
 * Mutates persisted optimization fields for a spec, creating state when needed.
 */
export class UpdatePersistedSpecOptimizations {
  /**
   * Creates a new `UpdatePersistedSpecOptimizations` use case instance.
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
   * Executes the persisted optimization update.
   *
   * @param input - Update parameters
   * @returns The resulting optimization projection and whether state was created
   * @throws {InvalidInputError} If `set` and `clear` conflict or no operation is provided
   * @throws {WorkspaceNotFoundError} If the workspace does not exist
   * @throws {ReadOnlyWorkspaceError} If the workspace is read-only
   * @throws {SpecNotFoundError} If the spec does not exist
   */
  async execute(
    input: UpdatePersistedSpecOptimizationsInput,
  ): Promise<UpdatePersistedSpecOptimizationsResult> {
    const validatedInput = parseUpdatePersistedSpecOptimizationsInput(input)

    const { workspace, capPath } = parseSpecId(validatedInput.specId)
    const repo = this.specRepositories.get(workspace)
    if (repo === undefined) {
      throw new WorkspaceNotFoundError(workspace)
    }
    if (repo.ownership() === 'readOnly') {
      throw new ReadOnlyWorkspaceError(workspace)
    }

    const spec = await repo.get(SpecPath.parse(capPath))
    if (spec === null) {
      throw new SpecNotFoundError(validatedInput.specId)
    }

    let current = await repo.readPersistedState(spec)
    if (current === null && validatedInput.set === undefined) {
      return { specId: validatedInput.specId, created: false }
    }

    const schemaResult = await this.getActiveSchema.execute()
    if (schemaResult.raw) throw new Error('schema resolution failed')
    const schemaIdentity = {
      name: schemaResult.schema.name(),
      version: schemaResult.schema.version(),
    }
    const artifactState = await this._captureArtifactState(repo, spec, schemaResult.schema)

    let created = false
    if (current === null) {
      const dependsOn = await resolveInitialPersistedDependsOn(
        { specId: validatedInput.specId, schema: schemaIdentity },
        {
          specRepo: repo,
          schemaProvider: { get: () => Promise.resolve(schemaResult.schema) },
          parsers: this.resolveInitialPersistedDependsOnDeps.parsers,
          extractorTransforms: this.resolveInitialPersistedDependsOnDeps.extractorTransforms,
          hasher: this.resolveInitialPersistedDependsOnDeps.hasher,
          repositories: this.specRepositories,
        },
      )
      current = {
        schema: schemaIdentity,
        dependsOn,
        implementation: [],
        originalHash: '',
      }
      created = true
    }

    const nextOptimizations: {
      optimizedDescription?: import('../../domain/services/spec-optimization.js').PersistedOptimizationField
      optimizedContext?: import('../../domain/services/spec-optimization.js').PersistedOptimizationField
    } = {
      ...(current.optimizations ?? {}),
    }

    if (validatedInput.set !== undefined) {
      const schemaForField = created ? schemaIdentity : current.schema
      for (const [field, value] of Object.entries(validatedInput.set) as Array<
        [PersistedOptimizationFieldName, string]
      >) {
        nextOptimizations[field] = {
          value,
          schema: schemaForField,
          artifactState: normalizeArtifactState(artifactState),
        }
      }
    }

    if (validatedInput.clear !== undefined) {
      for (const field of validatedInput.clear) {
        delete nextOptimizations[field]
      }
    }

    const patchOptimizations =
      nextOptimizations.optimizedDescription === undefined &&
      nextOptimizations.optimizedContext === undefined
        ? null
        : (nextOptimizations as PersistedSpecOptimizations)

    const state = applyPersistedSpecStatePatch(
      created
        ? {
            kind: 'initial',
            schema: schemaIdentity,
            dependsOn: current.dependsOn,
          }
        : { kind: 'existing', state: current },
      { optimizations: patchOptimizations },
      { specId: validatedInput.specId },
    )

    await repo.writePersistedState(spec, state, {
      expectedRevision: created ? null : current.originalHash,
    })

    let projection: Readonly<Record<PersistedOptimizationFieldName, string>> | undefined
    if (patchOptimizations !== null) {
      projection = {
        ...(patchOptimizations.optimizedDescription !== undefined
          ? { optimizedDescription: patchOptimizations.optimizedDescription.value }
          : {}),
        ...(patchOptimizations.optimizedContext !== undefined
          ? { optimizedContext: patchOptimizations.optimizedContext.value }
          : {}),
      } as Readonly<Record<PersistedOptimizationFieldName, string>>
    }

    return {
      specId: validatedInput.specId,
      created,
      ...(projection !== undefined ? { optimizations: projection } : {}),
    }
  }

  /**
   * Captures artifact hashes used for optimization freshness tracking.
   *
   * @param repo - Workspace spec repository
   * @param spec - Resolved spec entity
   * @param schema - Effective spec schema
   * @returns Artifact state keyed by filename
   */
  private async _captureArtifactState(
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
