import { type Command } from 'commander'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError, cliError } from '../../handle-error.js'
import { collect } from '../../helpers/collect.js'
import {
  blockerTextLines,
  projectCliBlocker,
  projectCliNextActionRecord,
} from '../../guidance-presenter.js'
import {
  parseArtifactPolicyFlag,
  parseWorkflowPolicyFlag,
  resolveInvalidationOverride,
} from './_invalidation-flags.js'
import {
  publicProjectionChanges,
  readAutomaticReturn,
  type PublicAutomaticReturn,
  type PublicProjectionChange,
} from './_validity-present.js'

/**
 * Registers the `change edit` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerChangeEdit(parent: Command): void {
  parent
    .command('edit <name>')
    .allowExcessArguments(false)
    .description(
      "Edit a change's metadata, including its description and the list of specs it is scoped to.",
    )
    .option('--add-spec <id>', 'add a spec path (repeatable)', collect, [] as string[])
    .option('--remove-spec <id>', 'remove a spec path (repeatable)', collect, [] as string[])
    .option('--description <text>', 'set or replace the change description (informational)')
    .option(
      '--artifact-policy <policy>',
      'replace only the artifact invalidation dimension (none|surgical|downstream|global)',
    )
    .option(
      '--workflow-policy <policy>',
      'replace only the workflow invalidation dimension (preserve|redesign)',
    )
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  {
    result: "ok"  // always "ok" on success
    name: string  // change name
    specIds: string[]  // spec IDs now targeted by the change, one whole ID per element
    workspaces: string[]  // workspaces derived from specIds
    invalidated: boolean  // whether approval invalidation occurred
    scopeChanged: boolean  // whether the edit changed the change's spec scope
    validityChanged: boolean  // whether the edit changed any lifecycle validity projection
    state: string  // lifecycle state after the edit
    blockers?: Array<{  // present only when blockers exist: conditions blocking forward progress
      code: string  // stable blocker code
      message: string  // human-readable explanation
      label?: string  // short check label
      checkId?: string  // id of the check that produced the blocker
      action?: { kind: string, params?: object }  // structured recovery action, when core provides one
      bypassFlag?: string  // CLI flag that bypasses the blocker, when it is skippable
      details?: Record<string, unknown>  // blocker-specific structured details
    }>
    nextAction?: {  // present when core reports a recommended next step
      targetStep: string  // lifecycle step the action moves toward
      actionType: string  // kind of action (cognitive or mechanical)
      reason: string  // why this action is recommended
      command: string | null  // command or skill to run, or null when only guidance applies
      guidance?: string  // advice shown when command is null
      intent: 'design'|'implement'|'verify'|'archive'|null  // workflow intent, or null when none applies
      action?: { kind: string, params?: object }  // structured action, when core provides one
    }
    effectivePolicy?: {  // present when core reports the persisted invalidation policy
      artifacts: string  // artifact invalidation dimension: none|surgical|downstream|global
      workflow: string  // workflow invalidation dimension: preserve|redesign
    }
    projectionChanges?: Array<{  // present only when a validity projection changed
      projection: string  // projection that changed
      from: string  // previous projection status
      to: string  // new projection status
      cause: string  // why the projection changed
      differences: Array<{  // hash-free fingerprint differences
        scope: string  // fingerprint scope
        key: string  // differing key
        kind: string  // kind of difference
      }>
    }>
    automaticReturn?: {  // present when core reported an automatic lifecycle return
      cause: string  // why the change returned automatically
      from: string  // state the change left
      to: string  // state the change returned to
    } | null  // null when core reported no automatic return
  }
`,
    )
    .action(
      async (
        name: string,
        opts: {
          addSpec: string[]
          removeSpec: string[]
          description?: string
          artifactPolicy?: string
          workflowPolicy?: string
          format: string
          config?: string
        },
      ) => {
        const artifactPolicy = parseArtifactPolicyFlag(opts.artifactPolicy, opts.format)
        const workflowPolicy = parseWorkflowPolicyFlag(opts.workflowPolicy, opts.format)
        try {
          const hasChanges =
            opts.addSpec.length > 0 ||
            opts.removeSpec.length > 0 ||
            opts.description !== undefined ||
            artifactPolicy !== undefined ||
            workflowPolicy !== undefined

          if (!hasChanges) {
            cliError(
              'at least one of --add-spec, --remove-spec, --description, --artifact-policy, or --workflow-policy must be provided',
              opts.format,
            )
          }

          const { kernel } = await resolveCliContext({ configPath: opts.config })

          const addSpecIds = opts.addSpec.length > 0 ? opts.addSpec : undefined
          const removeSpecIds = opts.removeSpec.length > 0 ? opts.removeSpec : undefined

          const invalidation = resolveInvalidationOverride(artifactPolicy, workflowPolicy)
          const result = await kernel.changes.edit.execute({
            name,
            ...(addSpecIds !== undefined ? { addSpecIds } : {}),
            ...(removeSpecIds !== undefined ? { removeSpecIds } : {}),
            ...(opts.description !== undefined ? { description: opts.description } : {}),
            ...(invalidation !== undefined ? { invalidation } : {}),
          })
          const { change, invalidated } = result
          const scopeChanged = 'scopeChanged' in result ? result.scopeChanged : false
          const validityChanged = 'validityChanged' in result ? result.validityChanged : invalidated
          const blockers = 'blockers' in result ? result.blockers : []
          const projectedBlockers = blockers.map(projectCliBlocker)
          const rawNextAction = 'nextAction' in result ? result.nextAction : undefined
          const nextAction =
            rawNextAction !== undefined
              ? projectCliNextActionRecord(rawNextAction, blockers)
              : undefined
          const projectionChanges = publicProjectionChanges(
            'projectionChanges' in result ? result.projectionChanges : undefined,
          )
          const automaticReturn = readAutomaticReturn(
            'automaticReturn' in result ? result.automaticReturn : undefined,
          )
          const effectivePolicy = 'effectivePolicy' in result ? result.effectivePolicy : undefined

          if (
            projectionChanges.length > 0 ||
            (automaticReturn !== null && automaticReturn !== undefined)
          ) {
            const recovery =
              automaticReturn !== undefined && automaticReturn !== null
                ? ` — automatic return ${automaticReturn.from} → ${automaticReturn.to} (${automaticReturn.cause})`
                : ''
            const projections = projectionChanges.map((entry) => entry.projection).join(', ')
            const changed = projections === '' ? 'lifecycle validity' : projections
            process.stderr.write(`warning: validity changed (${changed})${recovery}\n`)
          }

          // Check for spec overlap and warn (only when specs changed)
          if (addSpecIds !== undefined || removeSpecIds !== undefined) {
            try {
              const overlapReport = await kernel.changes.detectOverlap.execute({ name })
              if (overlapReport.hasOverlap) {
                const specList = overlapReport.entries
                  .map(
                    (e) =>
                      `  ${e.specId} — also targeted by: ${e.changes
                        .filter((c) => c.name !== name)
                        .map((c) => `${c.name} (${c.state})`)
                        .join(', ')}`,
                  )
                  .join('\n')
                process.stderr.write(`warning: spec overlap detected:\n${specList}\n`)
              }
            } catch {
              // Overlap detection is best-effort — don't fail edit
            }
          }

          const fmt = parseFormat(opts.format)
          if (fmt === 'text') {
            const lines = [
              `updated change ${name}`,
              `specs:      ${[...change.specIds].join(', ')}`,
              `workspaces: ${[...change.workspaces].join(', ')}`,
              `state:      ${change.state}`,
            ]
            appendEditConsequences(lines, effectivePolicy, projectionChanges, automaticReturn)
            appendEditGuidance(lines, blockers, nextAction)
            output(lines.join('\n'), 'text')
          } else {
            output(
              {
                result: 'ok',
                name,
                specIds: [...change.specIds],
                workspaces: [...change.workspaces],
                invalidated,
                scopeChanged,
                validityChanged,
                state: change.state,
                ...(blockers.length > 0 ? { blockers: projectedBlockers } : {}),
                ...(nextAction !== undefined ? { nextAction } : {}),
                ...(effectivePolicy !== undefined ? { effectivePolicy } : {}),
                ...(projectionChanges.length > 0 ? { projectionChanges } : {}),
                ...(automaticReturn !== undefined ? { automaticReturn } : {}),
              },
              fmt,
            )
          }
        } catch (err) {
          handleError(err, opts.format)
        }
      },
    )
}

/**
 * Appends Core-owned blockers and advancement guidance to text output.
 *
 * @param lines - Text output lines
 * @param blockers - Canonical validity blockers returned by Core
 * @param nextAction - Canonical next action returned by Core, when available
 */
function appendEditGuidance(
  lines: string[],
  blockers: readonly Parameters<typeof blockerTextLines>[0][],
  nextAction:
    | {
        readonly targetStep: string
        readonly command: string | null
        readonly guidance?: string | undefined
        readonly reason: string
      }
    | undefined,
): void {
  if (blockers.length > 0) {
    lines.push('blockers:')
    for (const blocker of blockers) lines.push(...blockerTextLines(blocker))
  }
  if (nextAction !== undefined) {
    lines.push('next action:')
    lines.push(`  target:  ${nextAction.targetStep}`)
    lines.push(`  command: ${nextAction.command ?? '(none)'}`)
    if (nextAction.command === null && nextAction.guidance !== undefined) {
      lines.push(`  guidance: ${nextAction.guidance}`)
    }
    lines.push(`  reason:  ${nextAction.reason}`)
  }
}

/**
 * Appends policy, projection, and recovery lines returned by `EditChange`.
 *
 * @param lines - Text output lines
 * @param effectivePolicy - Policy Core persisted after the partial overlay
 * @param projectionChanges - Projection transitions Core committed
 * @param automaticReturn - Lifecycle return Core committed, when the field was present
 */
function appendEditConsequences(
  lines: string[],
  effectivePolicy: unknown,
  projectionChanges: readonly PublicProjectionChange[],
  automaticReturn: PublicAutomaticReturn | null | undefined,
): void {
  if (typeof effectivePolicy === 'object' && effectivePolicy !== null) {
    const policy = effectivePolicy as { artifacts?: unknown; workflow?: unknown }
    if (typeof policy.artifacts === 'string') lines.push(`artifacts:  ${policy.artifacts}`)
    if (typeof policy.workflow === 'string') lines.push(`workflow:   ${policy.workflow}`)
  }
  for (const change of projectionChanges) {
    lines.push(`projection: ${change.projection} ${change.from} → ${change.to} (${change.cause})`)
  }
  if (automaticReturn === null) {
    lines.push('automatic return: (none)')
  } else if (automaticReturn !== undefined) {
    lines.push(
      `automatic return: ${automaticReturn.from} → ${automaticReturn.to} (${automaticReturn.cause})`,
    )
  }
}
