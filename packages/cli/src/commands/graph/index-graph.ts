import { Command, Option } from 'commander'
import {
  type IndexOptions,
  type IndexResult,
  acquireGraphIndexLock,
  buildProjectGraphConfig,
} from '@specd/code-graph'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import * as core from '@specd/core'
import { output, parseFormat } from '../../formatter.js'
import { cliError } from '../../handle-error.js'
import { resolveGraphCliContext } from './resolve-graph-cli-context.js'
import { withProvider } from './with-provider.js'
import { codeGraphVersion } from './code-graph-version.js'

const GRAPH_INDEX_WORKER_ENV = 'SPECD_GRAPH_INDEX_WORKER'
const GRAPH_INDEX_LOCK_HELD_ENV = 'SPECD_GRAPH_INDEX_LOCK_HELD'
const GRAPH_INDEX_NO_WORKER_ENV = 'SPECD_GRAPH_INDEX_NO_WORKER'

/**
 * Registers the `graph index` command.
 * @param parent - The parent commander command.
 */
export function registerGraphIndex(parent: Command): void {
  parent
    .command('index')
    .allowExcessArguments(false)
    .description('Build or update the code graph index for the project.')
    .option('--force', 'rebuild the entire index from scratch', false)
    .addOption(
      new Option(
        '--exclude-path <glob...>',
        'one or more global paths to exclude from the index',
      ).argParser((val, prev: string[]) => (prev ?? []).concat(val.split(','))),
    )
    .option('--config <path>', 'path to specd.yaml')
    .option('--path <path>', 'repository root for bootstrap mode')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .action(
      async (opts: {
        force: boolean
        excludePath?: string[]
        config?: string
        path?: string
        format: string
      }) => {
        const fmt = parseFormat(opts.format)
        if (opts.config !== undefined && opts.path !== undefined) {
          cliError('--config and --path are mutually exclusive', opts.format, 1)
        }

        const isWorker = process.env[GRAPH_INDEX_WORKER_ENV] === 'true'
        const lockHeld = process.env[GRAPH_INDEX_LOCK_HELD_ENV] === 'true'
        const noWorker = process.env[GRAPH_INDEX_NO_WORKER_ENV] === 'true'

        let context: Awaited<ReturnType<typeof resolveGraphCliContext>>
        try {
          context = await resolveGraphCliContext({
            configPath: opts.config,
            repoPath: opts.path,
          })
        } catch (err: unknown) {
          cliError(
            err instanceof Error ? err.message : 'failed to resolve graph context',
            opts.format,
            1,
          )
          return
        }

        const { config, kernel } = context

        let lockRelease: (() => void) | null = null
        try {
          lockRelease = !isWorker && !lockHeld ? acquireGraphIndexLock(config) : null
        } catch (err: unknown) {
          cliError(
            err instanceof Error ? err.message : 'failed to acquire indexing lock',
            opts.format,
            3,
          )
          return
        }

        try {
          if (!isWorker && !noWorker) {
            const workerArgs = [...process.argv.slice(2)]
            const workerEnv = {
              ...process.env,
              [GRAPH_INDEX_WORKER_ENV]: 'true',
              [GRAPH_INDEX_LOCK_HELD_ENV]: 'true',
            }

            const worker = spawn(process.argv[0]!, [process.argv[1]!, ...workerArgs], {
              stdio: 'inherit',
              env: workerEnv,
            })

            const forwardSignal = (sig: NodeJS.Signals): void => {
              worker.kill(sig)
            }
            process.on('SIGINT', forwardSignal)
            process.on('SIGTERM', forwardSignal)

            worker.on('exit', (code, signal) => {
              process.removeListener('SIGINT', forwardSignal)
              process.removeListener('SIGTERM', forwardSignal)
              if (lockRelease) lockRelease()
              if (code !== 0 || signal) {
                process.stderr.write(`Worker exited with code ${code} and signal ${signal}\n`)
                process.exit(code ?? 1)
              }
              process.exit(0)
            })
          } else {
            await withProvider(
              config,
              opts.format,
              async (provider) => {
                const workspaces =
                  kernel !== null
                    ? (await kernel.project.listWorkspaces.execute()).map((ws) => ({
                        name: ws.name,
                        prefix: ws.prefix,
                        codeRoot: ws.codeRoot,
                        specRepo: ws.specRepo,
                        ownership: ws.ownership,
                        isExternal: ws.isExternal,
                      }))
                    : config.workspaces.map((ws) => {
                        const specsPath = ws.specsPath ?? join(config.projectRoot, 'specs')
                        const specRepo = core.createSpecRepository(
                          'fs',
                          {
                            workspace: ws.name,
                            ownership: ws.ownership,
                            isExternal: ws.isExternal,
                            configPath: config.configPath,
                          },
                          {
                            specsPath,
                            metadataPath: join(specsPath, '..', '.specd', 'metadata'),
                          },
                        )
                        return {
                          name: ws.name,
                          prefix: null,
                          codeRoot: ws.codeRoot,
                          specRepo,
                          ownership: ws.ownership,
                          isExternal: ws.isExternal,
                        }
                      })
                const projectRoot = config.projectRoot

                const vcs = await Promise.resolve(core.createVcsAdapter(projectRoot)).catch(
                  () => null,
                )
                const vcsRef = (await vcs?.ref()) ?? undefined

                const graphConfig = buildProjectGraphConfig(config, {
                  ...(opts.excludePath !== undefined ? { excludePaths: opts.excludePath } : {}),
                })

                const indexOptions: IndexOptions = {
                  projectRoot,
                  workspaces,
                  graphConfig,
                  codeGraphVersion,
                  ...(vcsRef !== undefined ? { vcsRef } : {}),
                  onProgress: (percent, phase) => {
                    if (fmt === 'text') {
                      const pct = Math.round(percent)
                      process.stdout.write(`\rIndexing: ${pct}% ${phase}${' '.repeat(20)}`)
                    }
                  },
                }

                const result = await provider.index(indexOptions)

                if (fmt === 'text') {
                  process.stdout.write('\n')
                  output(formatTextIndexResult(result), 'text')
                } else {
                  output(result, fmt)
                }
              },
              opts.force
                ? {
                    beforeOpen: async (provider) => provider.recreate(),
                  }
                : undefined,
            )
          }
        } catch (err) {
          if (lockRelease) lockRelease()
          cliError(err instanceof Error ? err.message : 'indexing failed', opts.format, 1)
        }
      },
    )
}

/**
 * Formats an index result according to the text-mode CLI contract.
 *
 * @param result - The completed indexing result.
 * @returns Human-readable text output.
 */
function formatTextIndexResult(result: IndexResult): string {
  const lines = [
    `Indexed ${String(result.filesIndexed)} file(s) in ${String(result.duration)}ms`,
    `  discovered: ${String(result.filesDiscovered)}`,
    `  documents:  ${String(result.documentsIndexed)}`,
    `  skipped:    ${String(result.filesSkipped)}`,
    `  removed:    ${String(result.filesRemoved)}`,
    `  specs:      ${String(result.specsIndexed)}`,
    `  errors:     ${String(result.errors.length)}`,
  ]

  if (result.workspaces.length > 0) {
    lines.push('  workspaces:')
    for (const workspace of result.workspaces) {
      lines.push(
        `    ${workspace.name}: ${String(workspace.filesDiscovered)} discovered, ${String(workspace.filesIndexed)} indexed, ${String(workspace.documentsIndexed)} documents, ${String(workspace.filesSkipped)} skipped, ${String(workspace.filesRemoved)} removed`,
      )
    }
  }

  if (result.fullRebuildReason !== null) {
    lines.push(`  full rebuild: ${result.fullRebuildReason}`)
  }

  for (const error of result.errors) {
    lines.push(`    ${error.filePath}: ${error.message}`)
  }

  return lines.join('\n')
}
