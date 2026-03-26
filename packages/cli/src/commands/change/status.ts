import { type Command } from 'commander'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'

/**
 * Registers the `change status` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerChangeStatus(parent: Command): void {
  parent
    .command('status <name>')
    .allowExcessArguments(false)
    .description(
      'Display the current state, artifact statuses, lifecycle transitions, and blockers for a named change.',
    )
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  {
    name: string
    state: string
    specIds: string[]
    schema: { name: string, version: number }
    description?: string
    artifacts: Array<{ type: string, effectiveStatus: string }>
  }
`,
    )
    .action(async (name: string, opts: { format: string; config?: string }) => {
      try {
        const { kernel } = await resolveCliContext({ configPath: opts.config })
        const { change, artifactStatuses, lifecycle } = await kernel.changes.status.execute({
          name,
        })

        // Schema version warning (using lifecycle.schemaInfo instead of independent resolution)
        if (lifecycle.schemaInfo !== null) {
          const recorded = `${change.schemaName}@${change.schemaVersion}`
          const current = `${lifecycle.schemaInfo.name}@${lifecycle.schemaInfo.version}`
          if (recorded !== current) {
            process.stderr.write(
              `warning: change was created with schema ${recorded} but active schema is ${current}\n`,
            )
          }
        }

        const fmt = parseFormat(opts.format)

        if (fmt === 'text') {
          const lines = [
            `change:      ${change.name}`,
            `state:       ${change.state}`,
            `specs:       ${[...change.specIds].join(', ') || '(none)'}`,
          ]
          if (change.description !== undefined) {
            lines.push(`description: ${change.description}`)
          }
          lines.push('')
          lines.push('artifacts:')
          for (const a of artifactStatuses) {
            lines.push(`  ${a.type}  ${a.effectiveStatus}`)
          }

          // Lifecycle section
          lines.push('')
          lines.push('lifecycle:')
          if (lifecycle.availableTransitions.length > 0) {
            lines.push(`  transitions:  ${lifecycle.availableTransitions.join(', ')}`)
          }
          if (lifecycle.nextArtifact !== null) {
            lines.push(`  next artifact: ${lifecycle.nextArtifact}`)
          }
          const specGate = lifecycle.approvals.spec ? 'on' : 'off'
          const signoffGate = lifecycle.approvals.signoff ? 'on' : 'off'
          lines.push(`  approvals:     spec=${specGate}  signoff=${signoffGate}`)
          lines.push(`  path:          ${lifecycle.changePath}`)

          if (lifecycle.blockers.length > 0) {
            lines.push('')
            lines.push('blockers:')
            for (const b of lifecycle.blockers) {
              lines.push(`  \u2192 ${b.transition}: ${b.reason} \u2014 ${b.blocking.join(', ')}`)
            }
          }

          output(lines.join('\n'), 'text')
        } else {
          output(
            {
              name: change.name,
              state: change.state,
              specIds: [...change.specIds],
              schema: { name: change.schemaName, version: change.schemaVersion },
              ...(change.description !== undefined ? { description: change.description } : {}),
              artifacts: artifactStatuses.map((a) => ({
                type: a.type,
                effectiveStatus: a.effectiveStatus,
              })),
              lifecycle: {
                validTransitions: [...lifecycle.validTransitions],
                availableTransitions: [...lifecycle.availableTransitions],
                blockers: lifecycle.blockers.map((b) => ({
                  transition: b.transition,
                  reason: b.reason,
                  blocking: [...b.blocking],
                })),
                approvals: lifecycle.approvals,
                nextArtifact: lifecycle.nextArtifact,
                changePath: lifecycle.changePath,
                schemaInfo: lifecycle.schemaInfo,
              },
            },
            fmt,
          )
        }
      } catch (err) {
        handleError(err, opts.format)
      }
    })
}
