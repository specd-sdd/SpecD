import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { type Command } from 'commander'
import { loadConfig } from '../../load-config.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'
import { resolveSpecPath } from '../../helpers/resolve-spec-path.js'

/**
 * Registers the `spec resolve-path` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerSpecResolvePath(parent: Command): void {
  parent
    .command('resolve-path <path>')
    .description('Resolve a filesystem path to a spec identifier')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (fsPath: string, opts: { format: string; config?: string }) => {
      try {
        const config = await loadConfig({ configPath: opts.config })

        const absolute = path.resolve(process.cwd(), fsPath)

        let stat: Awaited<ReturnType<typeof fs.stat>>
        try {
          stat = await fs.stat(absolute)
        } catch {
          process.stderr.write(`error: path does not exist: ${absolute}\n`)
          process.exit(1)
        }

        const dir = stat.isDirectory() ? absolute : path.dirname(absolute)

        const result = resolveSpecPath(dir, config)
        if (result === null) {
          process.stderr.write(
            `error: path does not fall under any configured workspace's specsPath: ${dir}\n`,
          )
          process.exit(1)
        }

        const fmt = parseFormat(opts.format)
        if (fmt === 'text') {
          output(result.specId, 'text')
        } else {
          output(
            {
              workspace: result.workspace,
              specPath: result.specPath,
              specId: result.specId,
            },
            fmt,
          )
        }
      } catch (err) {
        handleError(err)
      }
    })
}
