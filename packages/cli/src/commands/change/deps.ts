import { type Command } from 'commander'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError, cliError } from '../../handle-error.js'
import { collect } from '../../helpers/collect.js'
import { confirmOrExit } from '../../helpers/confirm.js'

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
      'Add, remove, replace, or clear declared spec dependencies for a change, or list current dependencies when no modification flags are provided.',
    )
    .option('--add <id>', 'add a dependency spec ID (repeatable)', collect, [] as string[])
    .option('--remove <id>', 'remove a dependency spec ID (repeatable)', collect, [] as string[])
    .option(
      '--set <id>',
      'replace all dependencies (repeatable, mutually exclusive with --add/--remove/--clear)',
      collect,
      [] as string[],
    )
    .option(
      '--clear',
      'clear all dependencies for the spec (mutually exclusive with --add/--remove/--set)',
    )
    .option('--force', 'skip confirmation for --clear')
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
          clear?: boolean
          force?: boolean
          format: string
          config?: string
        },
      ) => {
        try {
          const { kernel } = await resolveCliContext({ configPath: opts.config })
          const fmt = parseFormat(opts.format)

          const clear = opts.clear === true
          const hasOp =
            opts.add.length > 0 || opts.remove.length > 0 || opts.set.length > 0 || clear

          // Modification flags require a specId
          if (hasOp && !specId) {
            cliError(
              'modification flags (--add, --remove, --set, --clear) require a specId',
              opts.format,
            )
          }

          if (clear && (opts.add.length > 0 || opts.remove.length > 0 || opts.set.length > 0)) {
            cliError('--clear is mutually exclusive with --add, --remove, and --set', opts.format)
          }

          if (opts.set.length > 0 && (opts.add.length > 0 || opts.remove.length > 0)) {
            cliError('--set is mutually exclusive with --add and --remove', opts.format)
          }

          // Listing/Display mode (no flags)
          if (!hasOp) {
            if (specId) {
              // Display one spec; the use case validates and normalizes the ID
              const shown = await kernel.changes.getSpecDeps.execute({ name, specId })
              if (fmt === 'text') {
                const depsStr = shown.dependsOn.length > 0 ? shown.dependsOn.join(', ') : '(none)'
                output(
                  `spec dependencies for ${shown.specId} in change ${name}:\ndependsOn: ${depsStr}`,
                  'text',
                )
              } else {
                output(
                  {
                    result: 'ok',
                    name,
                    specId: shown.specId,
                    dependsOn: [...shown.dependsOn],
                  },
                  fmt,
                )
              }
            } else {
              // List all specs in change
              const statusResult = await kernel.changes.status.execute({ name })
              const specDependsOn = statusResult.specDependsOn
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

          // Clear mode (confirm first)
          if (clear) {
            const confirmed = await confirmOrExit({
              message: `Clear all dependencies of ${specId}?`,
              nonInteractiveMessage: '--clear requires confirmation; pass --force to skip it',
              format: opts.format,
              ...(opts.force !== undefined ? { force: opts.force } : {}),
            })
            if (!confirmed) {
              if (fmt === 'text') {
                output('cancelled', 'text')
              } else {
                output({ result: 'cancelled' }, fmt)
              }
              return
            }
          }

          // Modification mode (has specId and flags)
          const result = await kernel.changes.updateSpecDeps.execute({
            name,
            specId: specId!,
            ...(opts.add.length > 0 ? { add: opts.add } : {}),
            ...(opts.remove.length > 0 ? { remove: opts.remove } : {}),
            ...(opts.set.length > 0 ? { set: opts.set } : {}),
            ...(clear ? { clear: true } : {}),
          })

          if (fmt === 'text') {
            const depsStr = result.dependsOn.length > 0 ? result.dependsOn.join(', ') : '(none)'
            output(
              `updated deps for ${result.specId} in change ${name}\ndependsOn: ${depsStr}`,
              'text',
            )
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
          handleError(err, opts.format, { command: 'change.deps' })
        }
      },
    )
}
