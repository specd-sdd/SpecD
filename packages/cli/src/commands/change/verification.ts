import { type Command } from 'commander'
import { type Kernel } from '@specd/sdk'
import { output, parseFormat, type OutputFormat } from '../../formatter.js'
import { cliError, handleError } from '../../handle-error.js'
import { resolveCliContext } from '../../helpers/cli-context.js'
import {
  fingerprintTextLines,
  publicDifferences,
  publicProjectionChanges,
  publicValidity,
  readAutomaticReturn,
  summarizeFingerprint,
  type PublicAutomaticReturn,
  type PublicNextAction,
} from './_validity-present.js'

/** Use cases mounted on `kernel.changes` for explicit verification. */
interface VerificationChanges {
  startVerification: {
    execute(input: { readonly name: string }): Promise<StartVerificationCliResult>
  }
  completeVerification: {
    execute(input: { readonly name: string }): Promise<CompleteVerificationCliResult>
  }
  invalidateVerification: {
    execute(input: {
      readonly name: string
      readonly reason: string
    }): Promise<InvalidateVerificationCliResult>
  }
}

/** Result shape returned by `StartVerification`. */
interface StartVerificationCliResult {
  readonly change: { readonly name: string; readonly state: string }
  readonly attempt: { readonly id: string; readonly baseline: unknown }
  readonly supersededAttemptId: string | null
  readonly reconciliation?: unknown
}

/** Result shape returned by `CompleteVerification`. */
interface CompleteVerificationCliResult {
  readonly change: { readonly name: string; readonly state: string }
  readonly verification: {
    readonly id: string
    readonly attemptId: string
    readonly status: string
    readonly fingerprint: unknown
  }
  readonly reconciliation?: unknown
}

/** Result shape returned by `InvalidateVerification`. */
interface InvalidateVerificationCliResult {
  readonly change: { readonly name: string; readonly state: string }
  readonly verification: {
    readonly id: string
    readonly status: string
    readonly fingerprint: unknown
  }
  readonly invalidated: boolean
  readonly reason: string
  readonly signoffChanged: boolean
  readonly automaticReturn: PublicAutomaticReturn | null
  readonly blockers: readonly { readonly code: string; readonly message: string }[]
  readonly nextAction: PublicNextAction
}

/**
 * Registers `changes verification` start, complete, and invalidate.
 *
 * @param parent - The parent `changes` command
 */
export function registerChangeVerification(parent: Command): void {
  const verification = parent
    .command('verification')
    .description(
      'Start, complete, or withdraw verification evidence without moving lifecycle state.',
    )

  verification
    .command('start <name>')
    .allowExcessArguments(false)
    .description('Start a verification attempt and capture a baseline. Does not record success.')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (name: string, opts: { format: string; config?: string }) => {
      try {
        const format = parseFormat(opts.format)
        const { kernel } = await resolveCliContext({ configPath: opts.config })
        const result = await verificationChanges(kernel).startVerification.execute({ name })
        renderStart(result, format)
      } catch (err) {
        reportVerificationError(err, opts.format)
      }
    })

  verification
    .command('complete <name>')
    .allowExcessArguments(false)
    .description('Record completed verification when the fresh fingerprint matches the attempt.')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (name: string, opts: { format: string; config?: string }) => {
      try {
        const format = parseFormat(opts.format)
        const { kernel } = await resolveCliContext({ configPath: opts.config })
        const result = await verificationChanges(kernel).completeVerification.execute({ name })
        renderComplete(result, format)
      } catch (err) {
        reportVerificationError(err, opts.format)
      }
    })

  verification
    .command('invalidate <name>')
    .allowExcessArguments(false)
    .description('Mark completed verification stale. Does not capture a new baseline.')
    .requiredOption('--reason <text>', 'mandatory audit reason for withdrawing verification')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (name: string, opts: { reason: string; format: string; config?: string }) => {
      try {
        const format = parseFormat(opts.format)
        if (opts.reason.trim() === '') {
          cliError('--reason must not be empty', format)
        }
        const { kernel } = await resolveCliContext({ configPath: opts.config })
        const result = await verificationChanges(kernel).invalidateVerification.execute({
          name,
          reason: opts.reason,
        })
        renderInvalidate(result, format)
      } catch (err) {
        reportVerificationError(err, opts.format)
      }
    })
}

/**
 * Reads verification use cases from the kernel without requiring them on older type builds.
 *
 * @param kernel - Wired kernel
 * @returns Start, complete, and invalidate use cases
 */
function verificationChanges(kernel: Kernel): VerificationChanges {
  return kernel.changes as Kernel['changes'] & VerificationChanges
}

/**
 * Render start.
 *
 * @param result - result
 * @param format - format
 */
function renderStart(result: StartVerificationCliResult, format: OutputFormat): void {
  const fingerprint = summarizeFingerprint(result.attempt.baseline) ?? {}
  const reconciliation = readReconciliation(result.reconciliation)
  if (format === 'text') {
    const lines = [
      `started verification attempt ${result.attempt.id}`,
      `change:     ${result.change.name}`,
      `state:      ${result.change.state}`,
      `superseded: ${result.supersededAttemptId ?? '(none)'}`,
      ...fingerprintTextLines('fingerprint', fingerprint),
      ...reconciliation.lines,
    ]
    output(lines.join('\n'), 'text')
    return
  }
  output(
    {
      result: 'ok',
      name: result.change.name,
      state: result.change.state,
      attemptId: result.attempt.id,
      supersededAttemptId: result.supersededAttemptId,
      fingerprint,
      ...reconciliation.payload,
    },
    format,
  )
}

/**
 * Render complete.
 *
 * @param result - result
 * @param format - format
 */
function renderComplete(result: CompleteVerificationCliResult, format: OutputFormat): void {
  const fingerprint = summarizeFingerprint(result.verification.fingerprint) ?? {}
  const reconciliation = readReconciliation(result.reconciliation)
  if (format === 'text') {
    const lines = [
      `completed verification ${result.verification.id}`,
      `attempt:    ${result.verification.attemptId}`,
      `status:     ${result.verification.status}`,
      `change:     ${result.change.name}`,
      `state:      ${result.change.state}`,
      ...fingerprintTextLines('fingerprint', fingerprint),
      ...reconciliation.lines,
    ]
    output(lines.join('\n'), 'text')
    return
  }
  output(
    {
      result: 'ok',
      name: result.change.name,
      state: result.change.state,
      verificationId: result.verification.id,
      attemptId: result.verification.attemptId,
      status: result.verification.status,
      fingerprint,
      ...reconciliation.payload,
    },
    format,
  )
}

/**
 * Render invalidate.
 *
 * @param result - result
 * @param format - format
 */
function renderInvalidate(result: InvalidateVerificationCliResult, format: OutputFormat): void {
  const fingerprint = summarizeFingerprint(result.verification.fingerprint) ?? {}
  const automaticReturn = projectAutomaticReturn(result.automaticReturn)
  const nextAction = projectNextAction(result.nextAction)
  const headline = result.invalidated ? 'verification invalidated' : 'verification already stale'
  if (format === 'text') {
    const lines = [
      headline,
      `evidence:    ${result.verification.id}`,
      `status:      ${result.verification.status}`,
      `reason:      ${result.reason}`,
      `change:      ${result.change.name}`,
      `state:       ${result.change.state}`,
      `sign-off:    ${result.signoffChanged ? 'marked stale' : 'unchanged'}`,
      ...returnLines(automaticReturn),
      ...fingerprintTextLines('fingerprint', fingerprint),
    ]
    if (result.blockers.length > 0) {
      lines.push('blockers:')
      for (const blocker of result.blockers) {
        lines.push(`  ! ${blocker.code}: ${blocker.message}`)
      }
    }
    lines.push('next action:')
    lines.push(`  target:  ${nextAction.targetStep}`)
    lines.push(`  command: ${nextAction.command ?? '(none)'}`)
    lines.push(`  reason:  ${nextAction.reason}`)
    output(lines.join('\n'), 'text')
    return
  }
  output(
    {
      result: 'ok',
      invalidated: result.invalidated,
      reason: result.reason,
      name: result.change.name,
      state: result.change.state,
      verificationId: result.verification.id,
      verificationStatus: result.verification.status,
      signoffChanged: result.signoffChanged,
      automaticReturn,
      blockers: result.blockers.map((blocker) => ({
        code: blocker.code,
        message: blocker.message,
      })),
      nextAction,
      fingerprint,
    },
    format,
  )
}

/**
 * Copies only the public automatic-return fields.
 *
 * @param value - Automatic-return projection produced by the use case
 * @returns A CLI-safe automatic-return projection, or null when absent
 */
function projectAutomaticReturn(value: PublicAutomaticReturn | null): PublicAutomaticReturn | null {
  if (value === null) return null
  return { cause: value.cause, from: value.from, to: value.to }
}

/**
 * Copies only the public next-action fields.
 *
 * @param value - Next-action projection produced by the use case
 * @returns A CLI-safe next-action projection
 */
function projectNextAction(value: PublicNextAction): PublicNextAction {
  return {
    targetStep: value.targetStep,
    actionType: value.actionType,
    reason: value.reason,
    command: value.command,
  }
}

/**
 * Report verification error.
 *
 * @param err - err
 * @param format - format
 * @returns report verification error result
 */
function reportVerificationError(err: unknown, format: string | undefined): never {
  if (isMismatchError(err)) {
    process.stderr.write(
      'Inspect the changed inputs, run verification start again, repeat verification work, then complete.\n',
    )
    cliError(err.message, format, 1, 'VERIFICATION_FINGERPRINT_MISMATCH', {
      metadata: { differences: publicDifferences(err.differences) },
    })
  }
  handleError(err, format)
}

/**
 * Is mismatch error.
 *
 * @param err - err
 * @returns is mismatch error result
 */
function isMismatchError(
  err: unknown,
): err is { readonly message: string; readonly differences?: unknown } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'VERIFICATION_FINGERPRINT_MISMATCH' &&
    'message' in err &&
    typeof (err as { message?: unknown }).message === 'string'
  )
}

/**
 * Read reconciliation.
 *
 * @param value - value
 * @returns text lines and structured reconciliation payload
 */
function readReconciliation(value: unknown): {
  readonly lines: readonly string[]
  readonly payload: {
    readonly automaticReturn?: PublicAutomaticReturn | null
    readonly blockers?: readonly { readonly code: string; readonly message: string }[]
    readonly projectionChanges?: ReturnType<typeof publicProjectionChanges>
    readonly validity?: ReturnType<typeof publicValidity>
  }
} {
  if (typeof value !== 'object' || value === null) return { lines: [], payload: {} }
  const record = value as {
    automaticReturn?: unknown
    verdict?: unknown
    projectionChanges?: unknown
  }
  const automaticReturn = readAutomaticReturn(record.automaticReturn)
  const validity = publicValidity(record.verdict)
  const projectionChanges = publicProjectionChanges(record.projectionChanges)
  const lines: string[] = []
  if (automaticReturn === null) lines.push('automatic return: (none)')
  else if (automaticReturn !== undefined) {
    lines.push(
      `automatic return: ${automaticReturn.from} → ${automaticReturn.to} (${automaticReturn.cause})`,
    )
  }
  for (const blocker of validity?.blockers ?? []) {
    lines.push(`blocker:     ${blocker.code}: ${blocker.message}`)
  }
  for (const change of projectionChanges) {
    lines.push(`projection:  ${change.projection} ${change.from} → ${change.to} (${change.cause})`)
  }
  return {
    lines,
    payload: {
      ...(automaticReturn !== undefined ? { automaticReturn } : {}),
      ...(validity?.blockers !== undefined ? { blockers: validity.blockers } : {}),
      ...(projectionChanges.length > 0 ? { projectionChanges } : {}),
      ...(validity !== undefined ? { validity } : {}),
    },
  }
}

/**
 * Return lines.
 *
 * @param automaticReturn - automatic return
 * @returns return lines result
 */
function returnLines(automaticReturn: PublicAutomaticReturn | null): string[] {
  if (automaticReturn === null) return ['automatic return: (none)']
  return [
    `automatic return: ${automaticReturn.from} → ${automaticReturn.to} (${automaticReturn.cause})`,
  ]
}
