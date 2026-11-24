import { type Command } from 'commander'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'
import { InvalidFormatError } from '../../errors/invalid-format-error.js'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { projectCliBlocker, projectCliNextAction } from '../../guidance-presenter.js'
import {
  fingerprintTextLines,
  formatDecisionTime,
  summarizeFingerprint,
  type PublicFingerprintSummary,
} from './_validity-present.js'

/**
 * Registers the `change approve` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerChangeApprove(parent: Command): void {
  const approveCmd = parent
    .command('approve')
    .description(
      'Approve a change at a lifecycle gate; use sub-commands spec or signoff to record the approval.',
    )

  approveCmd
    .command('spec <name>')
    .allowExcessArguments(false)
    .description('Record spec-gate consent for a change in ready (or a legacy parking state).')
    .requiredOption('--reason <text>', 'rationale for approval')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  { result: "ok", gate: "spec", name: string, state: string,
    approval?: { status, approver?, at?, fingerprint?, verificationId? } }
JSON/TOON error payload additions after a failed approval (under \`metadata\`):
  state: string,
  blockers: [{ code, message, label?, checkId?, action?, bypassFlag?, details? }],
  nextAction?: { targetStep, actionType, command: string|null, guidance?: string, reason, intent, action? }
`,
    )
    .action(async (name: string, opts: { reason: string; format: string; config?: string }) => {
      try {
        // Validate the output format before any mutation so a bad --format cannot leave the change approved.
        const fmt = parseFormat(opts.format)
        const { kernel } = await resolveCliContext({
          configPath: opts.config,
        })

        const change = await kernel.changes.approveSpec.execute({
          name,
          reason: opts.reason,
        })

        const evidence = readSpecApproval(change)
        if (fmt === 'text') {
          const lines = [`approved spec for ${name}`, `state:       ${change.state}`]
          if (evidence !== undefined) lines.push(...evidence.lines)
          output(lines.join('\n'), 'text')
        } else {
          output(
            {
              result: 'ok',
              gate: 'spec',
              name,
              state: change.state,
              ...(evidence !== undefined ? { approval: evidence.payload } : {}),
            },
            fmt,
          )
        }
      } catch (err) {
        if (err instanceof InvalidFormatError) handleError(err, opts.format)
        const projection = await enrichApprovalFailure(err, name, opts.config)
        handleErrorWithApprovalState(err, opts.format, projection)
      }
    })

  approveCmd
    .command('signoff <name>')
    .allowExcessArguments(false)
    .description('Record signoff-gate consent for a change in done (or a legacy parking state).')
    .requiredOption('--reason <text>', 'rationale for sign-off')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  { result: "ok", gate: "signoff", name: string, state: string,
    approval?: { status, approver?, at?, fingerprint?, verificationId? } }
JSON/TOON error payload additions after a failed approval (under \`metadata\`):
  state: string,
  blockers: [{ code, message, label?, checkId?, action?, bypassFlag?, details? }],
  nextAction?: { targetStep, actionType, command: string|null, guidance?: string, reason, intent, action? }
`,
    )
    .action(async (name: string, opts: { reason: string; format: string; config?: string }) => {
      try {
        // Validate the output format before any mutation so a bad --format cannot leave the change approved.
        const fmt = parseFormat(opts.format)
        const { kernel } = await resolveCliContext({
          configPath: opts.config,
        })

        const change = await kernel.changes.approveSignoff.execute({
          name,
          reason: opts.reason,
        })

        const evidence = readSignoff(change)
        if (fmt === 'text') {
          const lines = [`approved signoff for ${name}`, `state:       ${change.state}`]
          if (evidence !== undefined) lines.push(...evidence.lines)
          output(lines.join('\n'), 'text')
        } else {
          output(
            {
              result: 'ok',
              gate: 'signoff',
              name,
              state: change.state,
              ...(evidence !== undefined ? { approval: evidence.payload } : {}),
            },
            fmt,
          )
        }
      } catch (err) {
        if (err instanceof InvalidFormatError) handleError(err, opts.format)
        const projection = await enrichApprovalFailure(err, name, opts.config)
        handleErrorWithApprovalState(err, opts.format, projection)
      }
    })
}

/** Canonical status fields attached to an approval error after reconciliation may have committed. */
interface ApprovalFailureStatus {
  readonly state: string
  readonly blockers: readonly Record<string, unknown>[]
  readonly nextAction?: {
    readonly targetStep: string
    readonly command: string | null
    readonly guidance?: string
    readonly reason: string
  }
}

/**
 * Reports an approval failure: the shared `error:` line first, then (text only) the canonical
 * state, labelled blockers and next action, so the error line is never preceded by them.
 *
 * @param err - Approval error
 * @param format - Requested output format
 * @param projection - Canonical status projection, or `null` when it could not be reloaded
 * @returns Never; always rethrows through the shared error handler
 * @throws {CliExitError} Always, after the shared handler wrote the error line
 */
function handleErrorWithApprovalState(
  err: unknown,
  format: string,
  projection: ApprovalFailureStatus | null,
): never {
  try {
    handleError(err, format)
  } catch (exit) {
    if (projection !== null && format === 'text') {
      writeApprovalFailureText(projection)
    }
    throw exit
  }
}

/**
 * Writes the canonical state, blockers and next action of a failed approval to stderr.
 *
 * @param projection - Canonical status projection
 */
function writeApprovalFailureText(projection: ApprovalFailureStatus): void {
  process.stderr.write(`state: ${projection.state}\n`)
  for (const blocker of projection.blockers) {
    const label = typeof blocker.label === 'string' ? ` — ${blocker.label}` : ''
    process.stderr.write(`! ${String(blocker.code)}${label}: ${String(blocker.message)}\n`)
    if (typeof blocker.bypassFlag === 'string') {
      process.stderr.write(`  bypass: ${blocker.bypassFlag}\n`)
    }
  }
  if (projection.nextAction !== undefined) {
    process.stderr.write(`next action: ${projection.nextAction.command ?? '(none)'}\n`)
    if (projection.nextAction.command === null && projection.nextAction.guidance !== undefined) {
      process.stderr.write(`guidance: ${projection.nextAction.guidance}\n`)
    }
    process.stderr.write(`reason: ${projection.nextAction.reason}\n`)
  }
}

/**
 * Reloads canonical status after approval failure and attaches it to the error for structured
 * output. Assignment is defensive: read-only (getter-only) or frozen error properties are
 * shadowed with an own property, and a property that still cannot be set is skipped.
 *
 * @param err - Approval error that will be passed to the shared error handler
 * @param name - Actual change name
 * @param configPath - Optional config path
 * @returns The projection, or `null` when canonical status could not be reloaded
 */
async function enrichApprovalFailure(
  err: unknown,
  name: string,
  configPath: string | undefined,
): Promise<ApprovalFailureStatus | null> {
  let projection: ApprovalFailureStatus | null = null
  try {
    const { kernel } = await resolveCliContext({ configPath })
    const status = await kernel.changes.status.execute({ name })
    const state = status.change?.state ?? status.draftView?.state
    if (state !== undefined) {
      const projectedNextAction =
        status.nextAction !== undefined
          ? {
              ...projectCliNextAction(status.nextAction, status.blockers),
              intent: status.nextAction.intent,
              ...(status.nextAction.action !== undefined
                ? { action: status.nextAction.action }
                : {}),
            }
          : undefined
      projection = {
        state,
        blockers: Array.isArray(status.blockers) ? status.blockers.map(projectCliBlocker) : [],
        ...(projectedNextAction !== undefined ? { nextAction: projectedNextAction } : {}),
      }
    }
  } catch {
    // Preserve the original approval error if canonical status cannot be reloaded.
  }
  if (projection === null) return null

  if (typeof err === 'object' && err !== null) {
    const fields: Record<string, unknown> = {
      state: projection.state,
      blockers: projection.blockers,
      ...(projection.nextAction !== undefined ? { nextAction: projection.nextAction } : {}),
    }
    for (const [key, value] of Object.entries(fields)) {
      // Reflect.defineProperty reports failure (frozen or sealed error) instead of throwing, so the
      // original error stays untouched for that property.
      Reflect.defineProperty(err, key, {
        value,
        enumerable: true,
        configurable: true,
        writable: true,
      })
    }
  }
  return projection
}

/** Rendered approval evidence without file bytes or digests. */
interface ApprovalEvidence {
  readonly lines: readonly string[]
  readonly payload: {
    readonly status: string
    readonly approver?: string
    readonly at?: string
    readonly fingerprint?: PublicFingerprintSummary
    readonly verificationId?: string | null
  }
}

/**
 * Reads materialized spec approval from the change Core returned.
 *
 * @param change - `ApproveSpec` result
 * @returns Evidence view, or `undefined` when the projection is absent
 */
function readSpecApproval(change: unknown): ApprovalEvidence | undefined {
  if (typeof change !== 'object' || change === null || !('specApproval' in change)) return undefined
  const projection = (change as { specApproval?: unknown }).specApproval
  return readGateProjection(projection, 'spec')
}

/**
 * Reads materialized sign-off, including verification id and implementation shape.
 *
 * @param change - `ApproveSignoff` result
 * @returns Evidence view, or `undefined` when the projection is absent
 */
function readSignoff(change: unknown): ApprovalEvidence | undefined {
  if (typeof change !== 'object' || change === null || !('signoff' in change)) return undefined
  const projection = (change as { signoff?: unknown }).signoff
  return readGateProjection(projection, 'signoff')
}

/**
 * Read gate projection.
 *
 * @param projection - projection
 * @param gate - gate
 * @returns read gate projection result
 */
function readGateProjection(
  projection: unknown,
  gate: 'spec' | 'signoff',
): ApprovalEvidence | undefined {
  if (typeof projection !== 'object' || projection === null) return undefined
  const record = projection as {
    status?: unknown
    decision?: { at?: unknown; by?: { name?: unknown; email?: unknown } }
    fingerprint?: unknown
    verificationId?: unknown
  }
  if (typeof record.status !== 'string') return undefined
  const fingerprint = summarizeFingerprint(record.fingerprint)
  const approver = formatApprover(record.decision?.by)
  const at = formatDecisionTime(record.decision?.at)
  const lines = [`status:      ${record.status}`]
  if (approver !== undefined) lines.push(`approver:    ${approver}`)
  if (at !== '') lines.push(`at:          ${at}`)
  const verificationId =
    typeof record.verificationId === 'string' || record.verificationId === null
      ? record.verificationId
      : undefined
  if (gate === 'signoff') {
    lines.push(
      `verification: ${verificationId === undefined ? '(none)' : verificationId === null ? 'legacy unknown' : verificationId}`,
    )
  }
  if (fingerprint !== undefined) lines.push(...fingerprintTextLines('fingerprint', fingerprint))
  return {
    lines,
    payload: {
      status: record.status,
      ...(approver !== undefined ? { approver } : {}),
      ...(at !== '' ? { at } : {}),
      ...(fingerprint !== undefined ? { fingerprint } : {}),
      ...(gate === 'signoff' && verificationId !== undefined ? { verificationId } : {}),
    },
  }
}

/**
 * Format approver.
 *
 * @param by - by
 * @returns format approver result
 */
function formatApprover(by: { name?: unknown; email?: unknown } | undefined): string | undefined {
  if (by === undefined) return undefined
  const name = typeof by.name === 'string' ? by.name : undefined
  const email = typeof by.email === 'string' ? by.email : undefined
  if (name === undefined && email === undefined) return undefined
  if (name !== undefined && email !== undefined) return `${name} <${email}>`
  return name ?? email
}
