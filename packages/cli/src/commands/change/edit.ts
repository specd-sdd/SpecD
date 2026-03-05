import { type Command } from 'commander'
import { createCliKernel } from '../../kernel.js'
import { loadConfig } from '../../load-config.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'
import { parseSpecId } from '../../helpers/spec-path.js'
import { collect } from '../../helpers/collect.js'

/**
 * Registers the `change edit` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerChangeEdit(parent: Command): void {
  parent
    .command('edit <name>')
    .description('Edit the spec scope of a change')
    .option('--add-spec <id>', 'add a spec path (repeatable)', collect, [] as string[])
    .option('--remove-spec <id>', 'remove a spec path (repeatable)', collect, [] as string[])
    .option('--description <text>', 'set or replace the change description (informational)')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(
      async (
        name: string,
        opts: {
          addSpec: string[]
          removeSpec: string[]
          description?: string
          format: string
          config?: string
        },
      ) => {
        try {
          const config = await loadConfig({ configPath: opts.config })

          const hasChanges =
            opts.addSpec.length > 0 || opts.removeSpec.length > 0 || opts.description !== undefined

          if (!hasChanges) {
            process.stderr.write(
              'error: at least one of --add-spec, --remove-spec, or --description must be provided\n',
            )
            process.exit(1)
          }

          const kernel = createCliKernel(config)

          const addSpecIds =
            opts.addSpec.length > 0
              ? opts.addSpec.map((s) => parseSpecId(s, config).specId)
              : undefined
          const removeSpecIds =
            opts.removeSpec.length > 0
              ? opts.removeSpec.map((s) => parseSpecId(s, config).specId)
              : undefined

          const { change, invalidated } = await kernel.changes.edit.execute({
            name,
            ...(addSpecIds !== undefined ? { addSpecIds } : {}),
            ...(removeSpecIds !== undefined ? { removeSpecIds } : {}),
            ...(opts.description !== undefined ? { description: opts.description } : {}),
          })

          if (invalidated) {
            process.stderr.write(
              'warning: approvals invalidated — change rolled back to designing\n',
            )
          }

          const fmt = parseFormat(opts.format)
          if (fmt === 'text') {
            const lines = [
              `updated change ${name}`,
              `specs:      ${[...change.specIds].join(', ')}`,
              `workspaces: ${[...change.workspaces].join(', ')}`,
            ]
            output(lines.join('\n'), 'text')
          } else {
            output(
              {
                result: 'ok',
                name,
                specIds: [...change.specIds],
                workspaces: [...change.workspaces],
                invalidated,
                state: change.state,
              },
              fmt,
            )
          }
        } catch (err) {
          handleError(err)
        }
      },
    )
}
