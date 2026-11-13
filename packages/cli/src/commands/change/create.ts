import { type Command } from 'commander'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'
import { collect } from '../../helpers/collect.js'

/**
 * Registers the `change create` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerChangeCreate(parent: Command): void {
  parent
    .command('create <name>')
    .allowExcessArguments(false)
    .description('Create a new change to track a unit of work through the specd lifecycle.')
    .option('--spec <id>', 'spec path (repeatable)', collect, [] as string[])
    .option('--description <text>', 'change description (informational)')
    .option(
      '--invalidation-policy <policy>',
      'set the invalidation policy (none|surgical|downstream|global)',
    )
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  { result: "ok", name: string, state: string, changePath: string }
`,
    )
    .action(
      async (
        name: string,
        opts: {
          spec: string[]
          description?: string
          invalidationPolicy?: string
          format: string
          config?: string
        },
      ) => {
        try {
          const { config, kernel } = await resolveCliContext({ configPath: opts.config })

          const invalidationPolicy: string | undefined =
            opts.invalidationPolicy ?? config.invalidationPolicy
          const { change, changePath, overlapReport } = await kernel.changes.create.execute({
            name,
            ...(opts.description !== undefined ? { description: opts.description } : {}),
            specIds: opts.spec,
            ...(opts.spec.length > 0 ? { includeOverlapCheck: true } : {}),
            ...(invalidationPolicy !== undefined ? { invalidationPolicy } : {}),
          })

          if (overlapReport?.hasOverlap === true) {
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

          const fmt = parseFormat(opts.format)
          if (fmt === 'text') {
            output(`created change ${name}`, 'text')
          } else {
            output({ result: 'ok', name, state: change.state, changePath }, fmt)
          }
        } catch (err) {
          handleError(err, opts.format)
        }
      },
    )
}
