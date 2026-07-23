import { type ValidateSpecs } from './validate-specs.js'

/**
 * Input for the {@link GetSpecsHealth} use case.
 */
export interface GetSpecsHealthInput {
  /** Optional workspace name to filter the health check. */
  readonly workspace?: string
}

/**
 * Aggregated health status of the specifications.
 */
export interface GetSpecsHealthResult {
  /** Total number of specs validated. */
  readonly totalSpecs: number
  /** Number of specs that passed cleanly (0 failures, 0 warnings). */
  readonly passed: number
  /** Number of specs that failed (>= 1 failure). */
  readonly failed: number
  /** Number of specs that contain warnings but no failures (0 failures, >= 1 warning). */
  readonly warned: number
  /**
   * Consolidated list of specs that contain failures and/or warnings.
   * Specs that passed cleanly are excluded.
   */
  readonly issues: readonly {
    readonly spec: string
    readonly passed: boolean // false if the spec has failures, true if it only has warnings
    readonly failures: readonly { readonly artifactId: string; readonly description: string }[]
    readonly warnings: readonly { readonly artifactId: string; readonly description: string }[]
  }[]
}

/**
 * Aggregates overall health statistics of the project specifications.
 *
 * It invokes `ValidateSpecs.execute()` internally, calculates mutually exclusive health counters
 * (passed cleanly, failed, and warned), and returns detailed diagnostics consolidated in a single
 * `issues` list, omitting successful specs to optimize payload size.
 */
export class GetSpecsHealth {
  private readonly _validateSpecs: ValidateSpecs

  /**
   * Creates a new `GetSpecsHealth` use case instance.
   *
   * @param validateSpecs - The specification validation use case dependency
   */
  constructor(validateSpecs: ValidateSpecs) {
    this._validateSpecs = validateSpecs
  }

  /**
   * Executes the health aggregation logic.
   *
   * @param input - Optional filter parameters (e.g. workspace)
   * @returns The aggregated health summary and list of issues
   */
  async execute(input: GetSpecsHealthInput = {}): Promise<GetSpecsHealthResult> {
    const validationResult = await this._validateSpecs.execute(
      input.workspace !== undefined ? { workspace: input.workspace } : {},
    )

    let passed = 0
    let failed = 0
    let warned = 0
    const issues: Array<{
      readonly spec: string
      readonly passed: boolean
      readonly failures: readonly { readonly artifactId: string; readonly description: string }[]
      readonly warnings: readonly { readonly artifactId: string; readonly description: string }[]
    }> = []

    for (const entry of validationResult.entries) {
      const hasFailures = entry.failures.length > 0
      const hasWarnings = entry.warnings.length > 0

      if (hasFailures) {
        failed++
      } else if (hasWarnings) {
        warned++
      } else {
        passed++
      }

      if (hasFailures || hasWarnings) {
        issues.push({
          spec: entry.spec,
          passed: !hasFailures,
          failures: entry.failures,
          warnings: entry.warnings,
        })
      }
    }

    return {
      totalSpecs: validationResult.totalSpecs,
      passed,
      failed,
      warned,
      issues,
    }
  }
}
