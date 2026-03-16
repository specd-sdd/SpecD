import { type Command } from 'commander'
import * as path from 'node:path'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError, cliError } from '../../handle-error.js'

/**
 * Registers the `change archive` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerChangeArchive(parent: Command): void {
  parent
    .command('archive <name>')
    .allowExcessArguments(false)
    .description('Archive a completed change')
    .option('--no-hooks', 'skip run: hook execution')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  { result: "ok", name: string, archivePath: string }
`,
    )
    .action(async (name: string, opts: { format: string; config?: string; hooks: boolean }) => {
      try {
        const { config, kernel } = await resolveCliContext({ configPath: opts.config })

        const result = await kernel.changes.archive.execute({ name, skipHooks: !opts.hooks })

        const archivePath = path.relative(config.projectRoot, result.archiveDirPath)

        if (result.postHookFailures.length > 0) {
          const cmds = result.postHookFailures.join(', ')
          cliError(`post-archive hook(s) failed: ${cmds}`, opts.format, 2)
        }

        const fmt = parseFormat(opts.format)
        if (fmt === 'text') {
          output(`archived change ${name} → ${archivePath}`, 'text')
        } else {
          output(
            {
              result: 'ok',
              name,
              archivePath,
            },
            fmt,
          )
        }
      } catch (err) {
        handleError(err, opts.format)
      }
    })
}
