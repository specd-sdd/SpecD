import { type Command } from 'commander'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'
import { collect } from '../../helpers/collect.js'

/**
 * Registers the `change deps` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerChangeDeps(parent: Command): void {
  parent
    .command('deps <name> <specId>')
    .description('Manage declared dependencies for a spec within a change')
    .option('--add <id>', 'add a dependency spec ID (repeatable)', collect, [] as string[])
    .option('--remove <id>', 'remove a dependency spec ID (repeatable)', collect, [] as string[])
    .option(
      '--set <id>',
      'replace all dependencies (repeatable, mutually exclusive with --add/--remove)',
      collect,
      [] as string[],
    )
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(
      async (
        name: string,
        specId: string,
        opts: {
          add: string[]
          remove: string[]
          set: string[]
          format: string
          config?: string
        },
      ) => {
        try {
          const { kernel } = await resolveCliContext({ configPath: opts.config })

          const hasOp = opts.add.length > 0 || opts.remove.length > 0 || opts.set.length > 0
          if (!hasOp) {
            process.stderr.write(
              'error: at least one of --add, --remove, or --set must be provided\n',
            )
            process.exit(1)
          }

          if (opts.set.length > 0 && (opts.add.length > 0 || opts.remove.length > 0)) {
            process.stderr.write('error: --set is mutually exclusive with --add and --remove\n')
            process.exit(1)
          }

          const result = await kernel.changes.updateSpecDeps.execute({
            name,
            specId,
            ...(opts.add.length > 0 ? { add: opts.add } : {}),
            ...(opts.remove.length > 0 ? { remove: opts.remove } : {}),
            ...(opts.set.length > 0 ? { set: opts.set } : {}),
          })

          const fmt = parseFormat(opts.format)
          if (fmt === 'text') {
            const depsStr = result.dependsOn.length > 0 ? result.dependsOn.join(', ') : '(none)'
            output(`updated deps for ${specId} in change ${name}\ndependsOn: ${depsStr}`, 'text')
          } else {
            output(
              {
                result: 'ok',
                name,
                specId: result.specId,
                dependsOn: [...result.dependsOn],
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
