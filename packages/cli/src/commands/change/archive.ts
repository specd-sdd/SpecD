import { type Command } from 'commander'
import * as path from 'node:path'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { SpecOverlapError } from '@specd/core'
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
    .description('Move a completed change to the archive, removing it from the active change list.')
    .option('--no-hooks', 'skip run: hook execution')
    .option('--allow-overlap', 'permit archiving despite spec overlap with other active changes')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  { result: "ok", name: string, archivePath: string }
`,
    )
    .action(
      async (
        name: string,
        opts: { format: string; config?: string; hooks: boolean; allowOverlap?: true },
      ) => {
        try {
          const { config, kernel } = await resolveCliContext({ configPath: opts.config })

          const result = await kernel.changes.archive.execute({
            name,
            skipHooks: !opts.hooks,
            ...(opts.allowOverlap === true ? { allowOverlap: true } : {}),
          })

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
          if (err instanceof SpecOverlapError) {
            const specList = err.entries
              .map(
                (e) =>
                  `  ${e.specId} — also targeted by: ${e.changes
                    .filter((c) => c.name !== name)
                    .map((c) => `${c.name} (${c.state})`)
                    .join(', ')}`,
              )
              .join('\n')
            process.stderr.write(
              `error: cannot archive — spec overlap detected:\n${specList}\n\n` +
                'Use --allow-overlap to proceed despite overlap.\n',
            )
            process.exit(1)
          }
          handleError(err, opts.format)
        }
      },
    )
}
