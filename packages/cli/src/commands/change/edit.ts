import { type Command } from 'commander'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError, cliError } from '../../handle-error.js'
import { parseSpecId } from '../../helpers/spec-path.js'
import { collect } from '../../helpers/collect.js'
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
    result: "ok"
    name: string
    specIds: string[]
    workspaces: string[]
    invalidated: boolean
    state: string
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
          const { config, kernel } = await resolveCliContext({ configPath: opts.config })

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

          const parsedAddSpecs =
            opts.addSpec.length > 0 ? opts.addSpec.map((s) => parseSpecId(s, config)) : undefined

          if (parsedAddSpecs) {
            const readOnlyErrors: string[] = []
            for (const parsed of parsedAddSpecs) {
              const ws = config.workspaces.find((w) => w.name === parsed.workspace)
              if (ws && ws.ownership === 'readOnly') {
                readOnlyErrors.push(
                  `Cannot add spec "${parsed.specId}" to change — workspace "${parsed.workspace}" is readOnly.\n\nReadOnly workspaces are protected: their specs and code cannot be modified by changes.`,
                )
              }
            }
            if (readOnlyErrors.length > 0) {
              cliError(readOnlyErrors.join('\n'), opts.format)
            }
          }

          const addSpecIds = parsedAddSpecs?.map((p) => p.specId)
          const removeSpecIds =
            opts.removeSpec.length > 0
              ? opts.removeSpec.map((s) => parseSpecId(s, config).specId)
              : undefined

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
          const nextAction = 'nextAction' in result ? result.nextAction : undefined
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
                ...(blockers.length > 0 ? { blockers } : {}),
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
  blockers: readonly { readonly code: string; readonly message: string }[],
  nextAction:
    | {
        readonly targetStep: string
        readonly command: string | null
        readonly reason: string
      }
    | undefined,
): void {
  if (blockers.length > 0) {
    lines.push('blockers:')
    for (const blocker of blockers) {
      lines.push(`  ! ${blocker.code}: ${blocker.message}`)
    }
  }
  if (nextAction !== undefined) {
    lines.push('next action:')
    lines.push(`  target:  ${nextAction.targetStep}`)
    lines.push(`  command: ${nextAction.command ?? '(none)'}`)
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
