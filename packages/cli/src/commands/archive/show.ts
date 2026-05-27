import { type Command } from 'commander'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'

/**
 * Registers the `archive show` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerArchiveShow(parent: Command): void {
  parent
    .command('show <name>')
    .allowExcessArguments(false)
    .description('Display the full details of an archived change, including its specs and schema.')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  {
    name: string
    state: string
    archivedAt: string
    archivedBy?: { name: string, email: string }
    specIds: string[]
    schema: { name: string, version: number }
    artifacts: string[]
  }
`,
    )
    .action(async (name: string, opts: { format: string; config?: string }) => {
      try {
        const { kernel } = await resolveCliContext({ configPath: opts.config })
        const archived = await kernel.changes.getArchived.execute({ name })
        const fmt = parseFormat(opts.format)
        const specIds = [...archived.specIds]
        const artifactTypes = [...archived.artifacts.keys()]

        if (fmt === 'text') {
          const lines = [
            `name:        ${archived.name}`,
            `state:       ${archived.state}`,
            `archivedAt:  ${archived.archivedAt.toISOString()}`,
            ...(archived.archivedBy
              ? [`archivedBy:  ${archived.archivedBy.name} <${archived.archivedBy.email}>`]
              : []),
            `specs:       ${specIds.join(', ') || '(none)'}`,
            `schema:      ${archived.schemaName}@${archived.schemaVersion}`,
            `artifacts:   ${artifactTypes.join(', ') || '(none)'}`,
          ]
          output(lines.join('\n'), 'text')
        } else {
          output(
            {
              name: archived.name,
              state: archived.state,
              archivedAt: archived.archivedAt.toISOString(),
              ...(archived.archivedBy
                ? {
                    archivedBy: {
                      name: archived.archivedBy.name,
                      email: archived.archivedBy.email,
                    },
                  }
                : {}),
              specIds,
              schema: { name: archived.schemaName, version: archived.schemaVersion },
              artifacts: artifactTypes,
            },
            fmt,
          )
        }
      } catch (err) {
        handleError(err, opts.format)
      }
    })
}
