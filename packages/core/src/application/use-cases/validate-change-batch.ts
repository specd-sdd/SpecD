import { ChangeNotFoundError } from '../errors/change-not-found-error.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type SchemaProvider } from '../ports/schema-provider.js'
import {
  type ValidateArtifacts,
  type ValidateArtifactsResult,
  type ValidationFailure,
  type ValidationFileResult,
  type ValidationWarning,
} from './validate-artifacts.js'

/** Input for the {@link ValidateChangeBatch} use case. */
export interface ValidateChangeBatchInput {
  /** The change name to validate. */
  readonly name: string
  /**
   * When provided, only the artifact with this ID is validated across the batch
   * schedule (change-scoped once, spec-scoped once per `specId`).
   */
  readonly artifactId?: string
}

/** Result for one scheduled validation step in a batch run. */
export interface ValidateChangeBatchStepResult {
  /** Spec id for spec-scoped steps; `null` for change-scoped steps. */
  readonly spec: string | null
  /** Artifact type id validated in this step. */
  readonly artifact: string
  /** Whether this step passed validation. */
  readonly passed: boolean
  readonly failures: ValidationFailure[]
  readonly warnings: ValidationWarning[]
  readonly files: ValidationFileResult[]
}

/** Aggregated result returned by {@link ValidateChangeBatch.execute}. */
export interface ValidateChangeBatchResult {
  /** `true` only if every scheduled step passed. */
  readonly passed: boolean
  /** Number of scheduled steps. */
  readonly total: number
  /** One entry per scheduled validation step. */
  readonly results: readonly ValidateChangeBatchStepResult[]
}

/**
 * Validates a change by walking the active schema artifact DAG.
 *
 * Change-scoped artifacts are validated once without `specPath`. Spec-scoped
 * artifacts are validated once per `change.specIds` entry. Each step delegates
 * to {@link ValidateArtifacts} with a single `artifactId`.
 */
export class ValidateChangeBatch {
  private readonly _changes: ChangeRepository
  private readonly _schemaProvider: SchemaProvider
  private readonly _validateArtifacts: ValidateArtifacts

  /**
   * @param changes - Repository for loading the change
   * @param schemaProvider - Provider for the fully-resolved schema
   * @param validateArtifacts - Single-artifact validation use case
   */
  constructor(
    changes: ChangeRepository,
    schemaProvider: SchemaProvider,
    validateArtifacts: ValidateArtifacts,
  ) {
    this._changes = changes
    this._schemaProvider = schemaProvider
    this._validateArtifacts = validateArtifacts
  }

  /**
   * @param input - Batch validation parameters
   * @returns Aggregated batch result
   * @throws {ChangeNotFoundError} If no change with the given name exists
   */
  async execute(input: ValidateChangeBatchInput): Promise<ValidateChangeBatchResult> {
    const change = await this._changes.get(input.name)
    if (change === null) {
      throw new ChangeNotFoundError(input.name)
    }

    const specIds = change.specIds
    if (specIds.length === 0) {
      return { passed: true, total: 0, results: [] }
    }

    const schema = await this._schemaProvider.get()
    const dag = schema.artifactDag()
    const results: ValidateChangeBatchStepResult[] = []

    for (const artifactId of dag.topologicalOrder()) {
      if (input.artifactId !== undefined && artifactId !== input.artifactId) {
        continue
      }

      const artifactType = schema.artifact(artifactId)
      if (artifactType === null) {
        continue
      }

      if (artifactType.scope === 'change') {
        results.push(
          this._toStepResult(null, artifactId, await this._validateArtifacts.execute({
            name: input.name,
            artifactId,
          })),
        )
        continue
      }

      for (const specPath of specIds) {
        results.push(
          this._toStepResult(
            specPath,
            artifactId,
            await this._validateArtifacts.execute({
              name: input.name,
              specPath,
              artifactId,
            }),
          ),
        )
      }
    }

    const passed = results.every((step) => step.passed)
    return {
      passed,
      total: results.length,
      results,
    }
  }

  private _toStepResult(
    spec: string | null,
    artifact: string,
    result: ValidateArtifactsResult,
  ): ValidateChangeBatchStepResult {
    return {
      spec,
      artifact,
      passed: result.passed,
      failures: result.failures,
      warnings: result.warnings,
      files: result.files,
    }
  }
}
