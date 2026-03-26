import * as path from 'node:path'
import { type Command } from 'commander'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError, cliError } from '../../handle-error.js'

/**
 * Registers the `spec resolve-path` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerSpecResolvePath(parent: Command): void {
  parent
    .command('resolve-path <path>')
    .allowExcessArguments(false)
    .description(
      'Resolve and print the spec identifier for a given filesystem path, based on the active workspace configuration.',
    )
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (fsPath: string, opts: { format: string; config?: string }) => {
      try {
        const { config, kernel } = await resolveCliContext({ configPath: opts.config })

        const absolute = path.resolve(process.cwd(), fsPath)

        let result: {
          specPath: string
          specId: string
          workspace: string
          specsPathLength: number
        } | null = null

        for (const ws of config.workspaces) {
          const repo = kernel.specs.repos.get(ws.name)
          if (repo === undefined) continue

          const resolved = await repo.resolveFromPath(absolute)
          if (resolved !== null && 'specId' in resolved) {
            if (result === null || ws.specsPath.length > result.specsPathLength) {
              result = {
                specPath: resolved.specPath.toString(),
                specId: resolved.specId,
                workspace: ws.name,
                specsPathLength: ws.specsPath.length,
              }
            }
          }
        }

        if (result === null) {
          cliError(
            `path does not fall under any configured workspace's specsPath: ${absolute}`,
            opts.format,
          )
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
        handleError(err, opts.format)
      }
    })
}
