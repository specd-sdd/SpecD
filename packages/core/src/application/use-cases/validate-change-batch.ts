import { ChangeNotFoundError } from '../errors/change-not-found-error.js'
import { SchemaMismatchError } from '../errors/schema-mismatch-error.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type SchemaProvider } from '../ports/schema-provider.js'
import {
  type ValidateArtifacts,
  type ValidationFailure,
  type ValidationFileResult,
  type ValidationWarning,
} from './validate-artifacts.js'

/**
 * Input for the {@link ValidateChangeBatch} use case.
 */
export interface ValidateChangeBatchInput {
  /** The change name to validate. */
  readonly name: string
  /**
   * When provided, only DAG steps for this artifact ID are scheduled.
   * All other artifact nodes in the DAG are bypassed.
   */
  readonly artifactId?: string | undefined
}

/**
 * Individual step result within a batch change validation pass.
 */
export interface ValidateChangeBatchStepResult {
  /** Target spec ID for spec-scoped artifacts, or `null` for change-scoped artifacts. */
  readonly spec: string | null
  /** The artifact ID validated in this step. */
  readonly artifact: string
  /** Whether this step passed with zero failures. */
  readonly passed: boolean
  /** Validation failures encountered in this step. */
  readonly failures: readonly ValidationFailure[]
  /** Validation warnings encountered in this step. */
  readonly warnings: readonly ValidationWarning[]
  /** File entries evaluated in this step. */
  readonly files: readonly ValidationFileResult[]
}

/**
 * Aggregated result of batch change validation.
 */
export interface ValidateChangeBatchResult {
  /** Whether all executed steps passed. */
  readonly passed: boolean
  /** Total number of executed validation steps. */
  readonly total: number
  /** Ordered list of individual step outcomes preserving DAG topological order. */
  readonly results: readonly ValidateChangeBatchStepResult[]
}

/**
 * Canonical application use case that orchestrates batch change validation
 * by walking the active schema's artifact DAG in topological order and delegating
 * each change- or spec-scoped step to {@link ValidateArtifacts}.
 */
export class ValidateChangeBatch {
  /**
   * Constructs a new `ValidateChangeBatch` instance.
   *
   * @param _changes - The change repository
   * @param _schemaProvider - Provider to retrieve the active schema
   * @param _validateArtifacts - Use case to execute artifact validation
   */
  constructor(
    private readonly _changes: ChangeRepository,
    private readonly _schemaProvider: SchemaProvider,
    private readonly _validateArtifacts: ValidateArtifacts,
  ) {}

  /**
   * Executes batch validation for the requested change across all scheduled DAG steps.
   *
   * @param input - The batch validation options
   * @returns Aggregated batch validation results
   * @throws {@link ChangeNotFoundError} When the requested change does not exist
   * @throws {@link SchemaMismatchError} When the change schema does not match the active schema
   */
  async execute(input: ValidateChangeBatchInput): Promise<ValidateChangeBatchResult> {
    const change = await this._changes.get(input.name)
    if (change === null) {
      throw new ChangeNotFoundError(input.name)
    }

    const schema = await this._schemaProvider.get()
    if (schema.name() !== change.schemaName) {
      throw new SchemaMismatchError(change.name, change.schemaName, schema.name())
    }

    if (change.specIds.length === 0) {
      return { passed: true, total: 0, results: [] }
    }

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
        const stepResult = await this._validateArtifacts.execute({
          name: input.name,
          artifactId,
        })
        results.push({
          spec: null,
          artifact: artifactId,
          passed: stepResult.failures.length === 0,
          failures: stepResult.failures,
          warnings: stepResult.warnings,
          files: stepResult.files,
        })
        continue
      }

      for (const specId of change.specIds) {
        const stepResult = await this._validateArtifacts.execute({
          name: input.name,
          specPath: specId,
          artifactId,
        })
        results.push({
          spec: specId,
          artifact: artifactId,
          passed: stepResult.failures.length === 0,
          failures: stepResult.failures,
          warnings: stepResult.warnings,
          files: stepResult.files,
        })
      }
    }

    const allPassed = results.every((r) => r.passed)
    return {
      passed: allPassed,
      total: results.length,
      results,
    }
  }
}
