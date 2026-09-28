import { type Command } from 'commander'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'
import { resolveCliContext } from '../../helpers/cli-context.js'
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
    .description(
      'Record spec-gate consent for a change in ready (pending-spec-approval remains valid for drain).',
    )
    .requiredOption('--reason <text>', 'rationale for approval')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  { result: "ok", gate: "spec", name: string }
`,
    )
    .action(async (name: string, opts: { reason: string; format: string; config?: string }) => {
      try {
        const { kernel } = await resolveCliContext({
          configPath: opts.config,
        })

        const change = await kernel.changes.approveSpec.execute({
          name,
          reason: opts.reason,
        })

        const evidence = readSpecApproval(change)
        const fmt = parseFormat(opts.format)
        if (fmt === 'text') {
          const lines = [`approved spec for ${name}`]
          if (evidence !== undefined) lines.push(...evidence.lines)
          output(lines.join('\n'), 'text')
        } else {
          output(
            {
              result: 'ok',
              gate: 'spec',
              name,
              ...(evidence !== undefined ? { approval: evidence.payload } : {}),
            },
            fmt,
          )
        }
      } catch (err) {
        await enrichApprovalFailure(err, name, opts.config, opts.format)
        handleError(err, opts.format)
      }
    })

  approveCmd
    .command('signoff <name>')
    .allowExcessArguments(false)
    .description(
      'Record signoff-gate consent for a change in done (pending-signoff remains valid for drain).',
    )
    .requiredOption('--reason <text>', 'rationale for sign-off')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  { result: "ok", gate: "signoff", name: string }
`,
    )
    .action(async (name: string, opts: { reason: string; format: string; config?: string }) => {
      try {
        const { kernel } = await resolveCliContext({
          configPath: opts.config,
        })

        const change = await kernel.changes.approveSignoff.execute({
          name,
          reason: opts.reason,
        })

        const evidence = readSignoff(change)
        const fmt = parseFormat(opts.format)
        if (fmt === 'text') {
          const lines = [`approved signoff for ${name}`]
          if (evidence !== undefined) lines.push(...evidence.lines)
          output(lines.join('\n'), 'text')
        } else {
          output(
            {
              result: 'ok',
              gate: 'signoff',
              name,
              ...(evidence !== undefined ? { approval: evidence.payload } : {}),
            },
            fmt,
          )
        }
      } catch (err) {
        await enrichApprovalFailure(err, name, opts.config, opts.format)
        handleError(err, opts.format)
      }
    })
}

/** Canonical status fields attached to an approval error after reconciliation may have committed. */
interface ApprovalFailureStatus {
  readonly state: string
  readonly blockers: readonly { readonly code: string; readonly message: string }[]
  readonly nextAction?: {
    readonly targetStep: string
    readonly command: string | null
    readonly reason: string
  }
}

/**
 * Reloads canonical status after approval failure and adds it to text and structured errors.
 *
 * @param err - Approval error that will be passed to the shared error handler
 * @param name - Actual change name
 * @param configPath - Optional config path
 * @param format - Requested output format
 */
async function enrichApprovalFailure(
  err: unknown,
  name: string,
  configPath: string | undefined,
  format: string,
): Promise<void> {
  let projection: ApprovalFailureStatus | null = null
  try {
    const { kernel } = await resolveCliContext({ configPath })
    const status = await kernel.changes.status.execute({ name })
    const state = status.change?.state ?? status.draftView?.state
    if (state !== undefined) {
      projection = {
        state,
        blockers: Array.isArray(status.blockers) ? status.blockers : [],
        ...(status.nextAction !== undefined ? { nextAction: status.nextAction } : {}),
      }
    }
  } catch {
    // Preserve the original approval error if canonical status cannot be reloaded.
  }
  if (projection === null) return

  if (typeof err === 'object' && err !== null) {
    Object.assign(err, {
      state: projection.state,
      blockers: projection.blockers,
      ...(projection.nextAction !== undefined ? { nextAction: projection.nextAction } : {}),
    })
  }
  if (parseFormat(format) === 'text') {
    process.stderr.write(`state: ${projection.state}\n`)
    for (const blocker of projection.blockers) {
      process.stderr.write(`blocker: ${blocker.code} — ${blocker.message}\n`)
    }
    if (projection.nextAction !== undefined) {
      process.stderr.write(`next action: ${projection.nextAction.command ?? '(none)'}\n`)
      process.stderr.write(`reason: ${projection.nextAction.reason}\n`)
    }
  }
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
