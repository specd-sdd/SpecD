import { Command } from 'commander'
import { type IndexOptions, DEFAULT_EXCLUDE_PATHS } from '@specd/code-graph'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { createVcsAdapter } from '@specd/core'
import { output, parseFormat } from '../../formatter.js'
import { cliError } from '../../handle-error.js'
import { resolveGraphCliContext } from './resolve-graph-cli-context.js'
import { withProvider } from './with-provider.js'
import { buildWorkspaceTargets } from './build-workspace-targets.js'
import { type WorkspaceIndexTarget } from '@specd/code-graph'
import { acquireGraphIndexLock } from './graph-index-lock.js'

const GRAPH_INDEX_WORKER_ENV = 'SPECD_GRAPH_INDEX_WORKER'
const GRAPH_INDEX_LOCK_HELD_ENV = 'SPECD_GRAPH_INDEX_LOCK_HELD'

/**
 * Registers the `graph index` command.
 * @param parent - The parent commander command.
 */
export function registerGraphIndex(parent: Command): void {
  parent
    .command('index')
    .allowExcessArguments(false)
    .description('Index the workspace into the code graph')
    .option('--workspace <name>', 'index only the named workspace')
    .option('--force', 'full re-index, ignoring cached hashes')
    .option('--config <path>', 'path to specd.yaml')
    .option('--path <path>', 'repository root for bootstrap mode')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option(
      '--exclude-path <pattern>',
      'gitignore-syntax pattern to exclude (repeatable; merges with config)',
      (val: string, prev: string[]) => [...prev, val],
      [] as string[],
    )
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  {
    filesDiscovered: number
    filesIndexed: number
    filesRemoved: number
    filesSkipped: number
    specsDiscovered: number
    specsIndexed: number
    errors: Array<{ filePath: string, message: string }>
    duration: number
    workspaces: Array<{ name, filesDiscovered, filesIndexed, filesSkipped,
      filesRemoved, specsDiscovered, specsIndexed }>
  }
`,
    )
    .action(
      async (opts: {
        workspace?: string
        force?: boolean
        config?: string
        path?: string
        format: string
        excludePath: string[]
      }) => {
        const fmt = parseFormat(opts.format)
        const isTTY = process.stderr.isTTY === true && fmt === 'text'
        if (opts.config !== undefined && opts.path !== undefined) {
          cliError('--config and --path are mutually exclusive', opts.format, 1)
        }

        const context = await resolveGraphCliContext({
          configPath: opts.config,
          repoPath: opts.path,
        }).catch((err: unknown) =>
          cliError(
            err instanceof Error ? err.message : 'failed to resolve graph context',
            opts.format,
            1,
          ),
        )
        const { config } = context

        if (shouldRunInWorkerParent()) {
          const releaseLock = acquireGraphIndexLock(config)
          try {
            await runGraphIndexInWorker(opts)
          } finally {
            releaseLock()
          }
          return
        }

        const runIndex = async (): Promise<void> => {
          await withProvider(
            config,
            opts.format,
            async (provider) => {
              const progressFn = (percent: number, phase: string): void => {
                const clamped = Math.max(0, Math.min(100, percent))
                const width = 20
                const filled = Math.round((clamped / 100) * width)
                const bar = '█'.repeat(filled) + '░'.repeat(width - filled)
                process.stderr.write(`\r\x1b[K  ${bar} ${String(clamped).padStart(3)}% ${phase}`)
              }

              const rawWorkspaces: WorkspaceIndexTarget[] =
                context.mode === 'configured'
                  ? await buildWorkspaceTargets(config, context.kernel!, opts.workspace)
                  : buildBootstrapWorkspaceTargets(context.vcsRoot, opts.workspace)

              const workspaces =
                opts.excludePath.length > 0
                  ? rawWorkspaces.map((ws) => ({
                      ...ws,
                      excludePaths: [
                        ...(ws.excludePaths ?? DEFAULT_EXCLUDE_PATHS),
                        ...opts.excludePath,
                      ],
                    }))
                  : rawWorkspaces

              if (workspaces.length === 0) {
                output(
                  opts.workspace
                    ? `No workspace found matching "${opts.workspace}".`
                    : 'No workspaces configured.',
                  'text',
                )
                return
              }

              let vcsRef: string | undefined
              try {
                const vcs = await createVcsAdapter(config.projectRoot)
                vcsRef = (await vcs.ref()) ?? undefined
              } catch {
                // No VCS or ref() failed — staleness detection unavailable
              }

              const indexOpts: IndexOptions = {
                workspaces,
                projectRoot: config.projectRoot,
                ...(isTTY ? { onProgress: progressFn } : {}),
                ...(vcsRef !== undefined ? { vcsRef } : {}),
              }

              const result = await provider.index(indexOpts)

              if (isTTY) {
                process.stderr.write('\r\x1b[K')
              }

              if (fmt === 'text') {
                const lines = [
                  `Indexed ${String(result.filesIndexed)} file(s) in ${String(result.duration)}ms`,
                  `  discovered: ${String(result.filesDiscovered)}`,
                  `  skipped:    ${String(result.filesSkipped)}`,
                  `  removed:    ${String(result.filesRemoved)}`,
                  `  specs:      ${String(result.specsIndexed)}`,
                ]
                if (result.errors.length > 0) {
                  lines.push(`  errors:     ${String(result.errors.length)}`)
                  for (const err of result.errors) {
                    lines.push(`    ${err.filePath}: ${err.message}`)
                  }
                }
                if (result.workspaces.length > 1) {
                  lines.push('  workspaces:')
                  for (const ws of result.workspaces) {
                    const specsPart =
                      ws.specsIndexed > 0 || ws.specsDiscovered > 0
                        ? `, ${String(ws.specsIndexed)}/${String(ws.specsDiscovered)} specs`
                        : ''
                    lines.push(
                      `    ${ws.name}:    ${String(ws.filesDiscovered)} discovered, ${String(ws.filesIndexed)} indexed, ${String(ws.filesSkipped)} skipped, ${String(ws.filesRemoved)} removed${specsPart}`,
                    )
                  }
                }
                output(lines.join('\n'), 'text')
              } else {
                output(result, fmt)
              }
            },
            {
              beforeOpen: async (provider) => {
                if (opts.force) {
                  await provider.recreate()
                }
              },
            },
          )
        }

        if (process.env[GRAPH_INDEX_LOCK_HELD_ENV] === '1') {
          await runIndex()
          return
        }

        const releaseLock = acquireGraphIndexLock(config)
        try {
          await runIndex()
        } finally {
          releaseLock()
        }
      },
    )
}

/**
 * Returns true when `graph index` should delegate heavy work to a child process.
 * This keeps `Ctrl+C` responsive even if the worker blocks in synchronous or native code.
 *
 * @returns Whether the current process should act as the worker parent.
 */
function shouldRunInWorkerParent(): boolean {
  if (process.env[GRAPH_INDEX_WORKER_ENV] === '1') return false
  if (process.env['VITEST'] === 'true') return false
  if (process.env['VITEST_POOL_ID'] !== undefined) return false
  if (process.env['VITEST_WORKER_ID'] !== undefined) return false
  if (process.argv.some((arg) => arg.includes('vitest'))) return false
  const scriptPath = process.argv[1]
  return typeof scriptPath === 'string' && scriptPath.length > 0 && existsSync(scriptPath)
}

/**
 * Reconstructs CLI args for a worker `graph index` invocation.
 * @param opts - Parsed command options.
 * @param opts.workspace - Optional workspace filter.
 * @param opts.force - Whether to recreate the graph before indexing.
 * @param opts.config - Optional explicit config path.
 * @param opts.path - Optional bootstrap repository path.
 * @param opts.format - Selected output format.
 * @param opts.excludePath - Extra exclude patterns from the CLI.
 * @returns Node argv entries after the script path.
 */
function buildWorkerArgs(opts: {
  workspace?: string
  force?: boolean
  config?: string
  path?: string
  format: string
  excludePath: string[]
}): string[] {
  const args = ['graph', 'index']
  if (opts.workspace !== undefined) args.push('--workspace', opts.workspace)
  if (opts.force) args.push('--force')
  if (opts.config !== undefined) args.push('--config', opts.config)
  if (opts.path !== undefined) args.push('--path', opts.path)
  if (opts.format !== 'text') args.push('--format', opts.format)
  for (const pattern of opts.excludePath) {
    args.push('--exclude-path', pattern)
  }
  return args
}

/**
 * Runs the heavy graph indexing work in a child process so the parent can hard-kill
 * it immediately on `Ctrl+C`.
 * @param opts - Parsed command options.
 * @param opts.workspace - Optional workspace filter.
 * @param opts.force - Whether to recreate the graph before indexing.
 * @param opts.config - Optional explicit config path.
 * @param opts.path - Optional bootstrap repository path.
 * @param opts.format - Selected output format.
 * @param opts.excludePath - Extra exclude patterns from the CLI.
 * @returns A promise that resolves when the worker exits.
 */
async function runGraphIndexInWorker(opts: {
  workspace?: string
  force?: boolean
  config?: string
  path?: string
  format: string
  excludePath: string[]
}): Promise<void> {
  const scriptPath = process.argv[1]
  if (typeof scriptPath !== 'string' || scriptPath.length === 0) {
    cliError('graph index worker could not resolve the CLI entry script', opts.format, 3)
  }

  const child = spawn(process.execPath, [scriptPath, ...buildWorkerArgs(opts)], {
    stdio: 'inherit',
    env: {
      ...process.env,
      [GRAPH_INDEX_WORKER_ENV]: '1',
      [GRAPH_INDEX_LOCK_HELD_ENV]: '1',
    },
  })

  const terminateChild = (signal: NodeJS.Signals, exitCode: number): void => {
    if (!child.killed) {
      child.kill('SIGKILL')
    }
    process.exit(exitCode)
  }

  process.once('SIGINT', () => terminateChild('SIGINT', 130))
  process.once('SIGTERM', () => terminateChild('SIGTERM', 143))

  await new Promise<void>(() => {
    child.once('exit', (code, signal) => {
      if (signal === 'SIGINT') process.exit(130)
      if (signal === 'SIGTERM') process.exit(143)
      process.exit(code ?? 1)
    })
    child.once('error', (err) => {
      cliError(err.message, opts.format, 3)
    })
  })
}

/**
 * Builds the synthetic workspace targets used in graph bootstrap mode.
 *
 * @param vcsRoot - Resolved repository root.
 * @param workspaceFilter - Optional workspace filter from the CLI.
 * @returns Synthetic workspace targets for bootstrap indexing.
 */
function buildBootstrapWorkspaceTargets(
  vcsRoot: string,
  workspaceFilter?: string,
): WorkspaceIndexTarget[] {
  const target: WorkspaceIndexTarget = {
    name: 'default',
    codeRoot: vcsRoot,
    repoRoot: vcsRoot,
    specs: () => Promise.resolve([]),
  }

  return workspaceFilter !== undefined && workspaceFilter !== 'default' ? [] : [target]
}
