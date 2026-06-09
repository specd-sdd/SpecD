import { type Command } from 'commander'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError, cliError } from '../../handle-error.js'
import { collect } from '../../helpers/collect.js'

/**
 * Registers the `change deps` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerChangeDeps(parent: Command): void {
  parent
    .command('deps <name> [specId]')
    .allowExcessArguments(false)
    .description(
      'Add, remove, or replace declared spec dependencies for a change, or list current dependencies when no modification flags are provided.',
    )
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
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  When targeting a specific spec (modify or display):
  {
    result: "ok"
    name: string
    specId: string
    dependsOn: string[]
  }

  When listing all:
  {
    result: "ok"
    name: string
    specDependsOn: Record<string, string[]>
  }
`,
    )
    .action(
      async (
        name: string,
        specId: string | undefined,
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
          const fmt = parseFormat(opts.format)

          const hasOp = opts.add.length > 0 || opts.remove.length > 0 || opts.set.length > 0

          // Modification flags require a specId
          if (hasOp && !specId) {
            cliError('modification flags (--add, --remove, --set) require a specId', opts.format)
          }

          if (opts.set.length > 0 && (opts.add.length > 0 || opts.remove.length > 0)) {
            cliError('--set is mutually exclusive with --add and --remove', opts.format)
          }

          // Listing/Display mode (no flags)
          if (!hasOp) {
            const statusResult = await kernel.changes.status.execute({ name })
            const specDependsOn = statusResult.specDependsOn

            if (specId) {
              // Display one spec
              const change = statusResult.change ?? statusResult.draftView
              if (change && !change.specIds.includes(specId)) {
                cliError(`spec '${specId}' is not in the scope of change '${name}'`, opts.format)
              }

              const deps = specDependsOn[specId] ?? []
              if (fmt === 'text') {
                const depsStr = deps.length > 0 ? deps.join(', ') : '(none)'
                output(
                  `spec dependencies for ${specId} in change ${name}:\ndependsOn: ${depsStr}`,
                  'text',
                )
              } else {
                output(
                  {
                    result: 'ok',
                    name,
                    specId,
                    dependsOn: [...deps],
                  },
                  fmt,
                )
              }
            } else {
              // List all specs in change
              const specIds = statusResult.change?.specIds ?? statusResult.draftView?.specIds ?? []
              if (fmt === 'text') {
                const lines = [`spec dependencies for change ${name}:`]
                for (const id of specIds) {
                  const deps = specDependsOn[id]
                  lines.push(`- ${id}: ${deps?.length ? deps.join(', ') : '(none)'}`)
                }
                output(lines.join('\n'), 'text')
              } else {
                output(
                  {
                    result: 'ok',
                    name,
                    specDependsOn,
                  },
                  fmt,
                )
              }
            }
            return
          }

          // Modification mode (has specId and flags)
          const result = await kernel.changes.updateSpecDeps.execute({
            name,
            specId: specId!,
            ...(opts.add.length > 0 ? { add: opts.add } : {}),
            ...(opts.remove.length > 0 ? { remove: opts.remove } : {}),
            ...(opts.set.length > 0 ? { set: opts.set } : {}),
          })

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
          handleError(err, opts.format)
        }
      },
    )
}
