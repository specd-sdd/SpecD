import {
  type CheckAction,
  CheckNotSkippableError,
  CheckPredicateFailedError,
  type LifecycleActionIntent,
  type ReconciledOperationBlockedError,
} from '@specd/sdk'
import { skippableCheckHint } from './error-hints.js'

/** CLI-projected next-action DTO preserving `command` alongside host-neutral fields. */
export interface CliProjectedNextAction {
  readonly targetStep: string
  readonly actionType: string
  readonly reason: string
  /** Executable command, or `null` when the action has no command mapping. */
  readonly command: string | null
  /** Host-neutral guidance prose, present only when `command` is `null` and the action declared it. */
  readonly guidance?: string
}

const INTENT_COMMANDS: Readonly<Record<LifecycleActionIntent, string>> = {
  design: '/specd-design',
  implement: '/specd-implement',
  verify: '/specd-verify',
  archive: '/specd-archive',
}

/**
 * Resolves a CLI or slash command from a core {@link LifecycleActionIntent} or
 * {@link CheckAction}.
 *
 * Intent takes precedence when non-null; otherwise `action` is mapped to its CLI
 * equivalent. Unknown plugin kinds and verification actions without a valid
 * `changeName` have no command: this returns `null` and never guidance prose (see
 * {@link resolveCliWorkflowGuidance}).
 *
 * @param intent - Host-neutral phase intent from core, or `null`
 * @param action - Optional check-declared remediation action
 * @returns CLI/slash command string, or `null` when there is no command
 */
export function resolveCliWorkflowCommand(
  intent: LifecycleActionIntent | null,
  action?: CheckAction,
): string | null {
  if (intent !== null) {
    return INTENT_COMMANDS[intent] ?? null
  }
  if (action === undefined) {
    return null
  }
  switch (action.kind) {
    case 'approve-spec':
      return 'specd changes approve spec'
    case 'approve-signoff':
      return 'specd changes approve signoff'
    case 'start-verification': {
      const changeName = readNonEmptyString(action.params?.changeName)
      return changeName !== undefined ? `specd changes verification start ${changeName}` : null
    }
    case 'refresh-status': {
      const changeName = readNonEmptyString(action.params?.changeName)
      return changeName !== undefined ? `specd changes status ${changeName}` : null
    }
    default:
      return null
  }
}

/**
 * Resolves the host-neutral guidance prose to show when an action has no CLI command.
 *
 * @param intent - Host-neutral phase intent from core, or `null`
 * @param action - Optional check-declared remediation action
 * @returns The action's `guidance` when no command exists for it, otherwise `undefined`
 */
export function resolveCliWorkflowGuidance(
  intent: LifecycleActionIntent | null,
  action?: CheckAction,
): string | undefined {
  if (resolveCliWorkflowCommand(intent, action) !== null) {
    return undefined
  }
  return readNonEmptyString(action?.guidance)
}

/** Blocker shape accepted by {@link resolveCliBypassFlag}. */
export interface CliBypassBlocker {
  readonly isSkippable?: boolean | undefined
  readonly checkId?: string | undefined
}

/**
 * Projects the CLI `--skip-checks <checkId>` flag for a skippable blocker.
 *
 * @param blocker - Blocker skippability and check id
 * @returns CLI `--skip-checks <checkId>` string, or `undefined` when not skippable
 */
export function resolveCliBypassFlag(blocker: CliBypassBlocker): string | undefined {
  if (
    blocker.isSkippable === true &&
    typeof blocker.checkId === 'string' &&
    blocker.checkId.length > 0
  ) {
    return `--skip-checks ${blocker.checkId}`
  }
  return undefined
}

/** Blocker shape accepted by {@link projectCliBlocker}. */
export interface CliProjectableBlocker extends CliBypassBlocker {
  readonly code: string
  readonly message: string
  readonly label?: string | undefined
  readonly action?: unknown
  readonly details?: Record<string, unknown> | undefined
}

/**
 * Projects one core blocker for structured CLI output, rendering `bypassFlag` from
 * `isSkippable` and `checkId` and dropping the raw skippability flag.
 *
 * @param blocker - Blocker from `GetStatus`
 * @returns Structured blocker shared by `status`, `approve` and other commands
 */
export function projectCliBlocker(blocker: CliProjectableBlocker): Record<string, unknown> {
  const bypassFlag = resolveCliBypassFlag(blocker)
  return {
    code: blocker.code,
    message: blocker.message,
    ...(blocker.details !== undefined ? { details: blocker.details } : {}),
    ...(blocker.label !== undefined ? { label: blocker.label } : {}),
    ...(blocker.checkId !== undefined ? { checkId: blocker.checkId } : {}),
    ...(blocker.action !== undefined ? { action: blocker.action } : {}),
    ...(bypassFlag !== undefined ? { bypassFlag } : {}),
  }
}

/**
 * Renders one blocker as indented text lines (`! <CODE> — <label>: <message>`), followed by
 * the host-rendered `bypass:` line when the blocker is skippable.
 *
 * @param blocker - Blocker carrying code, message, optional label, checkId and skippability
 * @returns Text lines for a `blockers:` section
 */
export function blockerTextLines(blocker: CliProjectableBlocker): string[] {
  const lines = [
    blocker.label !== undefined
      ? `  ! ${blocker.code} \u2014 ${blocker.label}: ${blocker.message}`
      : `  ! ${blocker.code}: ${blocker.message}`,
  ]
  const bypassFlag = resolveCliBypassFlag(blocker)
  if (bypassFlag !== undefined) lines.push(`    bypass: ${bypassFlag}`)
  return lines
}

/** Host-neutral next-action input accepted by {@link projectCliNextAction}. */
export interface CliNextActionInput {
  readonly targetStep: string
  readonly actionType: string
  readonly reason: string
  readonly intent?: LifecycleActionIntent | null | undefined
  readonly action?: CheckAction | undefined
}

/** Blocker shape accepted by {@link projectCliNextAction}. */
export interface CliNextActionBlocker extends CliBypassBlocker {
  readonly code: string
  readonly message?: string | undefined
}

/**
 * Projects a host-neutral next action into the CLI DTO shape (`command` + overlap
 * bypass suffix in `reason` when archiving with a skippable overlap conflict).
 *
 * @param nextAction - Host-neutral next action from core
 * @param blockers - Optional blockers used to append the skippable overlap bypass hint
 * @returns CLI-projected next action
 */
export function projectCliNextAction(
  nextAction: CliNextActionInput,
  blockers?: readonly CliNextActionBlocker[],
): CliProjectedNextAction {
  const command = resolveCliWorkflowCommand(nextAction.intent ?? null, nextAction.action)
  const guidance = resolveCliWorkflowGuidance(nextAction.intent ?? null, nextAction.action)
  let reason = nextAction.reason
  if (nextAction.intent === 'archive' && blockers !== undefined) {
    const overlap = blockers.find((blocker) => blocker.code === 'OVERLAP_CONFLICT')
    if (overlap !== undefined) {
      const bypass = resolveCliBypassFlag(overlap)
      if (bypass !== undefined && !reason.includes(bypass)) {
        reason = `${reason} Use ${bypass} to archive anyway.`
      }
    }
  }
  return {
    targetStep: nextAction.targetStep,
    actionType: nextAction.actionType,
    reason,
    command,
    ...(guidance !== undefined ? { guidance } : {}),
  }
}

/**
 * Shared predicate: whether `err` is a `CheckPredicateFailedError`, matching
 * by class or by name so duck-typed errors behave identically in every command.
 *
 * @param err - Caught rejection
 * @returns Whether the error is a check predicate failure
 */
export function isCheckPredicateFailed(err: unknown): err is CheckPredicateFailedError {
  return (
    err instanceof CheckPredicateFailedError ||
    (typeof err === 'object' &&
      err !== null &&
      (err as { name?: unknown }).name === 'CheckPredicateFailedError')
  )
}

/**
 * Shared predicate: whether `err` is a `CheckNotSkippableError`, matching by class or by
 * name so duck-typed errors behave identically in every command.
 *
 * @param err - Caught rejection
 * @returns Whether the error is a non-skippable check error
 */
export function isCheckNotSkippable(err: unknown): err is CheckNotSkippableError {
  return (
    err instanceof CheckNotSkippableError ||
    (typeof err === 'object' &&
      err !== null &&
      (err as { name?: unknown }).name === 'CheckNotSkippableError')
  )
}

/**
 * Renders structured context lines from a {@link CheckPredicateFailedError}'s `details`
 * keyed by `checkId` / `checkCode`.
 *
 * @param err - Failed predicate error from `TransitionChange` or `ArchiveChange`
 * @returns Human-readable context lines for CLI repair guides and error output
 */
export function describeCheckFailure(err: CheckPredicateFailedError): readonly string[] {
  const details = err.details
  if (details === undefined) {
    return []
  }

  switch (err.checkId) {
    case 'workflow.requires': {
      const lines: string[] = []
      const artifactId = readNonEmptyString(details.artifactId)
      const status = readNonEmptyString(details.status)
      if (artifactId !== undefined) {
        lines.push(`Artifact: ${artifactId}${status !== undefined ? ` (${status})` : ''}`)
      }
      const blockedBy = details.blockedBy
      if (
        typeof blockedBy === 'object' &&
        blockedBy !== null &&
        typeof (blockedBy as { artifactId?: unknown }).artifactId === 'string'
      ) {
        const parent = blockedBy as { artifactId: string; status?: unknown }
        const parentStatus = readNonEmptyString(parent.status)
        lines.push(
          `Blocked by parent: ${parent.artifactId}${parentStatus !== undefined ? ` (${parentStatus})` : ''}`,
        )
      }
      return lines
    }
    case 'workflow.taskCompletion': {
      const artifactId = readNonEmptyString(details.artifactId) ?? 'tasks'
      if (details.reason === 'missing-task-capability') {
        return [`Artifact '${artifactId}' is not marked as containing tasks (hasTasks: true)`]
      }
      if (
        typeof details.complete === 'number' &&
        typeof details.total === 'number' &&
        typeof details.incomplete === 'number'
      ) {
        return [
          `Tasks (${artifactId}): ${String(details.complete)}/${String(details.total)} complete (${String(details.incomplete)} incomplete)`,
        ]
      }
      return []
    }
    case 'deps.consistent': {
      if (!Array.isArray(details.mismatches)) {
        return []
      }
      const lines: string[] = []
      for (const item of details.mismatches) {
        if (typeof item !== 'object' || item === null) continue
        const m = item as { specId?: unknown; extracted?: unknown; persisted?: unknown }
        if (typeof m.specId !== 'string') continue
        const extracted = Array.isArray(m.extracted) ? m.extracted.map(String) : []
        const persisted = Array.isArray(m.persisted) ? m.persisted.map(String) : []
        lines.push(
          `${m.specId}: extracted [${extracted.join(', ')}] vs persisted [${persisted.join(', ')}]`,
        )
      }
      return lines
    }
    case 'workspace.readOnly': {
      if (!Array.isArray(details.specs)) {
        return []
      }
      const lines: string[] = []
      for (const item of details.specs) {
        if (typeof item !== 'object' || item === null) continue
        const s = item as { specId?: unknown; workspace?: unknown }
        if (typeof s.specId === 'string' && typeof s.workspace === 'string') {
          lines.push(`${s.specId} -> workspace "${s.workspace}" (readOnly)`)
        }
      }
      return lines
    }
    case 'spec.overlap': {
      if (!Array.isArray(details.entries)) {
        return []
      }
      const lines: string[] = []
      for (const item of details.entries) {
        if (typeof item !== 'object' || item === null) continue
        const e = item as { specId?: unknown; changes?: unknown }
        if (typeof e.specId !== 'string' || !Array.isArray(e.changes)) continue
        const peers = e.changes
          .filter(
            (c): c is { name: string; state: string } =>
              typeof c === 'object' &&
              c !== null &&
              typeof (c as { name?: unknown }).name === 'string' &&
              typeof (c as { state?: unknown }).state === 'string',
          )
          .map((c) => `${c.name} [${c.state}]`)
        if (peers.length > 0) {
          lines.push(`${e.specId}: ${peers.join(', ')}`)
        }
      }
      return lines
    }
    case 'impl.filesResolved': {
      if (!Array.isArray(details.files)) {
        return []
      }
      const files = details.files.filter((f: unknown): f is string => typeof f === 'string')
      if (files.length === 0) {
        return []
      }
      const shown = files.slice(0, 5).join(', ')
      const suffix = files.length > 5 ? `, ... (${String(files.length)} total)` : ''
      return [`Open files: ${shown}${suffix}`]
    }
    case 'impl.linksInScope': {
      if (!Array.isArray(details.outOfScopeSpecIds)) {
        return []
      }
      const ids = details.outOfScopeSpecIds.filter(
        (s: unknown): s is string => typeof s === 'string',
      )
      return ids.length > 0 ? [`Out-of-scope specs: ${ids.join(', ')}`] : []
    }
    case 'schema.nameMatch': {
      const changeSchema = readNonEmptyString(details.changeSchemaName)
      const activeSchema = readNonEmptyString(details.schemaName)
      if (changeSchema !== undefined && activeSchema !== undefined) {
        return [`Change schema '${changeSchema}' does not match active schema '${activeSchema}'`]
      }
      return []
    }
    default:
      return []
  }
}

/**
 * Reads a non-empty string or returns `undefined`.
 *
 * @param value - Unknown value
 * @returns Non-empty string or `undefined`
 */
function readNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/**
 * Projects a next action for structured output: the CLI DTO plus the host-neutral `intent`
 * and optional check-declared `action`.
 *
 * @param nextAction - Host-neutral next action from core
 * @param blockers - Optional blockers used to append the skippable overlap bypass hint
 * @returns Structured next action carrying `command`, `guidance`, `intent` and `action`
 */
export function projectCliNextActionRecord(
  nextAction: CliNextActionInput,
  blockers?: readonly CliNextActionBlocker[],
): CliProjectedNextAction & {
  readonly intent: LifecycleActionIntent | null
  readonly action?: CheckAction
} {
  return {
    ...projectCliNextAction(nextAction, blockers),
    intent: nextAction.intent ?? null,
    ...(nextAction.action !== undefined ? { action: nextAction.action } : {}),
  }
}

/**
 * Projects a committed-recovery diagnostic for json/toon failure records.
 *
 * @param err - Error thrown by `TransitionChange` or `ArchiveChange`
 * @returns Committed `state`, `automaticReturn`, projected blockers and projected `nextAction`
 */
export function projectReconciledOperationBlocked(err: ReconciledOperationBlockedError): {
  readonly state: string
  readonly automaticReturn: unknown
  readonly blockers: readonly Record<string, unknown>[]
  readonly nextAction: ReturnType<typeof projectCliNextActionRecord>
} {
  const blockers = err.blockers as readonly CliProjectableBlocker[]
  return {
    state: err.state,
    automaticReturn: err.automaticReturn,
    blockers: blockers.map(projectCliBlocker),
    nextAction: projectCliNextActionRecord(err.nextAction, blockers),
  }
}

/**
 * Renders the text repair guide for a committed recovery (never an invalid-edge error line).
 *
 * @param err - Error thrown by `TransitionChange` or `ArchiveChange`
 * @returns Text lines to write to stderr
 */
export function reconciledRepairGuideLines(err: ReconciledOperationBlockedError): string[] {
  const blockers = err.blockers as readonly CliProjectableBlocker[]
  const next = projectCliNextAction(err.nextAction, blockers)
  const lines = [
    `change '${err.changeName}' was returned to '${err.state}' by validity reconciliation; ${err.operation} was not performed`,
  ]
  for (const b of blockers) {
    lines.push(
      b.label !== undefined
        ? `! ${b.code} \u2014 ${b.label}: ${b.message}`
        : `! ${b.code}: ${b.message}`,
    )
    if (b.checkId !== undefined) lines.push(`  check:   ${b.checkId}`)
    if (resolveCliBypassFlag(b) !== undefined) {
      lines.push(`  bypass:  ${skippableCheckHint(b.checkId ?? '')}`)
    }
    const action = (b as { action?: CheckAction }).action
    const blockerCommand = resolveCliWorkflowCommand(null, action)
    const blockerGuidance = resolveCliWorkflowGuidance(null, action)
    if (blockerCommand !== null) lines.push(`  command: ${blockerCommand}`)
    else if (blockerGuidance !== undefined) lines.push(`  guidance: ${blockerGuidance}`)
  }
  lines.push('', 'repair guide:', `  state:   ${err.state}`)
  const recovery = err.automaticReturn
  lines.push(`  return:  ${recovery.cause} (${recovery.from} \u2192 ${recovery.to})`)
  lines.push(`  target:  ${next.targetStep}`)
  if (next.command !== null) lines.push(`  command: ${next.command}`)
  else if (next.guidance !== undefined) lines.push(`  guidance: ${next.guidance}`)
  lines.push(`  reason:  ${next.reason}`)
  return lines
}

/**
 * Duck-typed guard for `ReconciledOperationBlockedError`.
 *
 * @param err - Caught value
 * @returns Whether the value is a committed-recovery diagnostic
 */
export function isReconciledOperationBlocked(err: unknown): err is ReconciledOperationBlockedError {
  return (
    err instanceof Error &&
    (err as { code?: unknown }).code === 'RECONCILED_OPERATION_BLOCKED' &&
    Array.isArray((err as { blockers?: unknown }).blockers)
  )
}
