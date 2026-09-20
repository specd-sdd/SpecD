import {
  CHECK_LABELS,
  fail,
  pass,
  skip,
  type Check,
  type CheckExecutionContext,
  type CheckId,
  type CheckKind,
  type CheckResult,
} from '../../domain/services/transition-checks.js'

/**
 * Abstract application check. Constructor deps are only the ports that `execute` uses.
 * Applicability, `phase`, and `onFailure` live on the binding row, not here.
 */
export abstract class WorkflowCheck implements Check {
  /**
   * Stable check id.
   *
   * @returns Check identifier
   */
  abstract get id(): CheckId

  /**
   * Gerund progress label for this check.
   *
   * @returns Canonical label from {@link CHECK_LABELS}
   */
  get label(): string {
    return CHECK_LABELS[this.id]
  }

  /**
   * Predicate vs `run:` hook.
   *
   * @returns Check kind
   */
  abstract get kind(): CheckKind

  /**
   * Self-sufficient evaluation using constructor ports.
   *
   * @param ctx - Host attempt context
   * @returns Check result
   */
  abstract execute(ctx: CheckExecutionContext): Promise<CheckResult>

  /**
   * Passing result.
   *
   * @returns Pass outcome
   */
  protected pass(): CheckResult {
    return pass(this.id, this.kind, this.label)
  }

  /**
   * Skipped result.
   *
   * @returns Skip outcome
   */
  protected skip(): CheckResult {
    return skip(this.id, this.kind, this.label)
  }

  /**
   * Failing result.
   *
   * @param code - Machine-readable code
   * @param message - Human-readable summary
   * @param details - Optional diagnostics
   * @returns Fail outcome
   */
  protected fail(
    code: string,
    message: string,
    details?: Readonly<Record<string, unknown>>,
  ): CheckResult {
    return fail(this.id, code, message, details, this.kind, this.label)
  }
}
