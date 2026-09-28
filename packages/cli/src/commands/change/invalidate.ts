import { type Command } from 'commander'
import { InvalidateRequiresForceError } from '@specd/sdk'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'
import {
  parseArtifactPolicyFlag,
  parseWorkflowPolicyFlag,
  resolveInvalidationOverride,
} from './_invalidation-flags.js'
import {
  describeEffectivePolicy,
  publicProjectionChanges,
  readAutomaticReturn,
} from './_validity-present.js'

/** A single file affected by invalidation, labelled with its expansion origin. */
type AffectedArtifactFile = {
  readonly artifactId: string
  readonly key: string
  readonly filename: string
  readonly expansion: 'direct' | 'downstream' | 'global'
}

/**
 * Registers the `change invalidate` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerChangeInvalidate(parent: Command): void {
  parent
    .command('invalidate <name>')
    .allowExcessArguments(false)
    .description(
      'Invalidate artifacts for this invocation. Policy flags are a command-scoped override and do not persist the stored policy. Recovery is reported from core.',
    )
    .requiredOption('--reason <text>', 'mandatory explanation for the invalidation')
    .option(
      '--target <target>',
      'target an artifact or artifact@specId (repeatable)',
      (value: string, previous: string[]) => [...previous, value],
      [],
    )
    .option(
      '--artifact-policy <policy>',
      'invocation-only artifact override (none|surgical|downstream|global); does not persist the stored policy',
    )
    .option(
      '--workflow-policy <policy>',
      'invocation-only workflow override (preserve|redesign); does not persist the stored policy',
    )
    .option('--force', 'confirm revocation of currently valid spec or sign-off consent')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .addHelpText(
      'after',
      `
Artifact policy (this invocation only; does not persist the stored policy):
  none       No additional artifacts are reopened
  surgical   Only the explicitly targeted files are reopened
  downstream Targets plus all DAG descendants are reopened
  global     Every artifact in the change is reopened

Workflow policy (this invocation only):
  preserve   Artifact drift itself does not move the lifecycle state
  redesign   Workflow recovery may return the change to designing

Core still applies mandatory gate recovery. These flags do not choose it.

Target syntax:
  artifactId            Target all files in the artifact
  artifactId@specId     Target a specific file in a spec-scoped artifact
`,
    )
    .action(
      async (
        name: string,
        opts: {
          reason: string
          target: string[]
          artifactPolicy?: string
          workflowPolicy?: string
          force?: boolean
          format: string
          config?: string
        },
      ) => {
        const artifactPolicy = parseArtifactPolicyFlag(opts.artifactPolicy, opts.format)
        const workflowPolicy = parseWorkflowPolicyFlag(opts.workflowPolicy, opts.format)
        try {
          const { kernel } = await resolveCliContext({ configPath: opts.config })

          const targets = opts.target.map((t) => {
            const atIdx = t.indexOf('@')
            if (atIdx === -1) {
              return { artifactId: t }
            }
            return { artifactId: t.slice(0, atIdx), specId: t.slice(atIdx + 1) }
          })

          const policyOverride = resolveInvalidationOverride(artifactPolicy, workflowPolicy)
          const result = await kernel.changes.invalidate.execute({
            name,
            reason: opts.reason,
            ...(policyOverride !== undefined ? { policyOverride } : {}),
            ...(targets.length > 0 ? { targets } : {}),
            ...(opts.force !== undefined ? { force: opts.force } : {}),
          })

          const fmt = parseFormat(opts.format)

          const policy = describeEffectivePolicy(result.effectivePolicy)
          const projectionChanges = publicProjectionChanges(
            'projectionChanges' in result ? result.projectionChanges : undefined,
          )
          const automaticReturn = readAutomaticReturn(
            'automaticReturn' in result ? result.automaticReturn : undefined,
          )
          const blockers = 'blockers' in result ? result.blockers : []
          const nextAction = 'nextAction' in result ? result.nextAction : undefined

          if (fmt === 'text') {
            const lines: string[] = []
            lines.push(`change:      ${result.change.name}`)
            lines.push(`state:       ${result.change.state}`)
            lines.push(`reason:      ${result.reason}`)
            lines.push(`policy:      ${policy.label}`)
            if (policyOverride !== undefined) {
              lines.push('policy scope: command-scoped override; the stored policy was not changed')
            }

            if (policy.artifacts === 'none') {
              lines.push('')
              lines.push(
                'No artifacts were invalidated because the effective artifact policy is "none".',
              )
              lines.push(
                'This does not clear existing drift, waive forward-progress blockers, or restore stale evidence.',
              )
              if (policy.workflow !== undefined) {
                lines.push(`Effective workflow policy: ${policy.workflow}.`)
              }
              lines.push(
                'Use --artifact-policy to choose a different artifact policy for this invocation. This does not change the stored policy.',
              )
            } else if (result.affected.length === 0) {
              lines.push('')
              lines.push('No artifacts were affected.')
            } else {
              lines.push('')
              lines.push('affected:')
              const byArtifact = new Map<string, AffectedArtifactFile[]>()
              for (const entry of result.affected) {
                let list = byArtifact.get(entry.artifactId)
                if (list === undefined) {
                  list = []
                  byArtifact.set(entry.artifactId, list)
                }
                list.push(entry)
              }
              const artifactOrder = result.affected.map((e) => e.artifactId)
              const seenArtifacts = new Set<string>()
              const orderedKeys = artifactOrder.filter((id) => {
                if (seenArtifacts.has(id)) return false
                seenArtifacts.add(id)
                return true
              })
              for (const artifactId of orderedKeys) {
                const entries = byArtifact.get(artifactId)!
                lines.push(`  ${artifactId}:`)
                for (const entry of entries) {
                  const expansionLabel =
                    entry.expansion !== 'direct' ? `  (${entry.expansion})` : ''
                  lines.push(`    - ${entry.key}  ${entry.filename}${expansionLabel}`)
                }
              }
            }

            for (const change of projectionChanges) {
              lines.push(
                `projection:  ${change.projection} ${change.from} → ${change.to} (${change.cause})`,
              )
            }
            if (automaticReturn === null) {
              lines.push('automatic return: (none)')
            } else if (automaticReturn !== undefined) {
              lines.push(
                `automatic return: ${automaticReturn.from} → ${automaticReturn.to} (${automaticReturn.cause})`,
              )
            }

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

            output(lines.join('\n'), 'text')
          } else {
            output(
              {
                name: result.change.name,
                state: result.change.state,
                reason: result.reason,
                effectivePolicy: result.effectivePolicy,
                affected: result.affected,
                ...(blockers.length > 0 ? { blockers } : {}),
                ...(nextAction !== undefined ? { nextAction } : {}),
                ...(projectionChanges.length > 0 ? { projectionChanges } : {}),
                ...(automaticReturn !== undefined ? { automaticReturn } : {}),
              },
              fmt,
            )
          }
        } catch (err) {
          if (err instanceof InvalidateRequiresForceError) {
            for (const recovery of err.recoveries) {
              process.stderr.write(
                `warning: valid ${recovery.gate} consent would be revoked; recovery target: ${recovery.target}. Re-run with --force.\n`,
              )
            }
          }
          handleError(err, opts.format)
        }
      },
    )
}
