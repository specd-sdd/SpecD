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
    .description('Show the status of a change')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (name: string, opts: { format: string; config?: string }) => {
      try {
        const { kernel } = await resolveCliContext({ configPath: opts.config })
        const { change, artifactStatuses } = await kernel.changes.status.execute({ name })

        // Schema version warning
        try {
          const activeSchema = await kernel.specs.getActiveSchema.execute()
          const recorded = `${change.schemaName}@${change.schemaVersion}`
          const current = `${activeSchema.name()}@${activeSchema.version()}`
          if (recorded !== current) {
            process.stderr.write(
              `warning: change was created with schema ${recorded} but active schema is ${current}\n`,
            )
          }
        } catch {
          // If schema resolution fails, skip the warning
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
            },
            fmt,
          )
        }
      } catch (err) {
        handleError(err)
      }
    })
}
