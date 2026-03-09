import * as path from 'node:path'
import { type Command } from 'commander'
import { loadConfig } from '../../load-config.js'
import { createCliKernel } from '../../kernel.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'

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
        const kernel = createCliKernel(config)

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
          if (resolved !== null) {
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
          process.stderr.write(
            `error: path does not fall under any configured workspace's specsPath: ${absolute}\n`,
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
