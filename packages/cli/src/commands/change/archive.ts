import { type Command } from 'commander'
import * as path from 'node:path'
import { createCliKernel } from '../../kernel.js'
import { loadConfig } from '../../load-config.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'
import { buildWorkspaceSchemasPaths } from '../../helpers/workspace-map.js'

/**
 * Registers the `change archive` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerChangeArchive(parent: Command): void {
  parent
    .command('archive <name>')
    .description('Archive a completed change')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (name: string, opts: { format: string; config?: string }) => {
      try {
        const config = await loadConfig({ configPath: opts.config })
        const kernel = createCliKernel(config)
        const workspaceSchemasPaths = buildWorkspaceSchemasPaths(config)

        const { change } = await kernel.changes.status.execute({ name })
        const workspace = change.workspaces[0] ?? 'default'

        const projectStep = config.workflow?.find((s) => s.step === 'archiving')
        const result = await kernel.changes.archive.execute({
          name,
          schemaRef: config.schemaRef,
          workspaceSchemasPaths,
          hookVariables: {
            project: { root: config.projectRoot },
            change: {
              name,
              workspace,
              path: config.storage.changesPath,
            },
          },
          ...(projectStep !== undefined ? { projectHooks: projectStep.hooks } : {}),
        })

        const archivePath = path.relative(config.projectRoot, result.archiveDirPath)

        if (result.postHookFailures.length > 0) {
          for (const cmd of result.postHookFailures) {
            process.stderr.write(`error: post-archive hook '${cmd}' failed\n`)
          }
          process.exit(2)
          return
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
        handleError(err)
      }
    })
}
