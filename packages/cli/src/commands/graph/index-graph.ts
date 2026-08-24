import { Command, Option } from 'commander'
import { spawn, type ChildProcess } from 'node:child_process'
import { acquireGraphIndexLock } from '@specd/sdk'
import {
  runIndexProjectGraph,
  type IndexPhaseMetric,
  type RunIndexProjectGraphResult,
} from '@specd/sdk'
import { output, parseFormat } from '../../formatter.js'
import { cliError } from '../../handle-error.js'
import { resolveSdkHostContext } from '../../helpers/sdk-host.js'
import { resolveGraphCliContext } from './resolve-graph-cli-context.js'

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
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  {
    filesDiscovered: number
    filesIndexed: number
    documentsIndexed: number
    filesSkipped: number
    filesRemoved: number
    specsDiscovered: number
    specsIndexed: number
    errors: Array<{ filePath, message }>
    duration: number
    workspaces: Array<{ name, filesDiscovered, filesIndexed, documentsIndexed, filesSkipped, filesRemoved, specsDiscovered, specsIndexed }>
    vcsRef: string | null
    graphFingerprint: string
    fullRebuild: boolean
    fullRebuildReason: string | null
    phaseMetrics: Record<string, { count: number, durationMs: number }>
  }
`,
    )
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

        if (
          process.env['SPECD_GRAPH_INDEX_WORKER'] !== 'true' &&
          process.env['SPECD_GRAPH_INDEX_NO_WORKER'] !== 'true'
        ) {
          try {
            await runIndexWorker(config)
          } catch (err) {
            cliError(err instanceof Error ? err.message : 'index worker failed', opts.format, 3)
          }
          return
        }

        try {
          const host = await resolveSdkHostContext(config, kernel)
          const result = await runIndexProjectGraph(host, {
            force: opts.force,
            ...(opts.excludePath !== undefined ? { excludePaths: opts.excludePath } : {}),
            onProgress: (percent, phase) => {
              if (fmt === 'text') {
                const pct = Math.round(percent)
                process.stdout.write(`\rIndexing: ${pct}% ${phase}${' '.repeat(20)}`)
              }
            },
          })

          if (fmt === 'text') {
            process.stdout.write('\n')
            output(formatTextIndexResult(result), 'text')
          } else {
            output(result, fmt)
          }
          process.exit(0)
        } catch (err) {
          cliError(err instanceof Error ? err.message : 'indexing failed', opts.format, 3)
        }
      },
    )
}

/**
 * Runs indexing in a child process while this parent owns the shared graph lock.
 * @param config - Resolved project configuration owning graph storage.
 */
async function runIndexWorker(config: Parameters<typeof acquireGraphIndexLock>[0]): Promise<void> {
  let child: ChildProcess | undefined
  const forwardSignal = (signal: NodeJS.Signals): void => {
    child?.kill(signal)
  }
  const onSigint = (): void => forwardSignal('SIGINT')
  const onSigterm = (): void => forwardSignal('SIGTERM')
  process.prependListener('SIGINT', onSigint)
  process.prependListener('SIGTERM', onSigterm)
  const release = acquireGraphIndexLock(config)
  try {
    child = spawn(process.execPath, process.argv.slice(1), {
      stdio: 'inherit',
      env: {
        ...process.env,
        SPECD_GRAPH_INDEX_WORKER: 'true',
        SPECD_GRAPH_INDEX_LOCK_HELD: 'true',
      },
    })
    const exitCode = await new Promise<number>((resolve, reject) => {
      child!.once('error', reject)
      child!.once('exit', (code, signal) => {
        if (code !== null) resolve(code)
        else resolve(signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 3)
      })
    })
    release()
    process.removeListener('SIGINT', onSigint)
    process.removeListener('SIGTERM', onSigterm)
    process.exit(exitCode)
  } finally {
    release()
    process.removeListener('SIGINT', onSigint)
    process.removeListener('SIGTERM', onSigterm)
  }
}

/**
 * Formats an index result according to the text-mode CLI contract.
 *
 * @param result - The completed indexing result.
 * @returns Human-readable text output.
 */
function formatTextIndexResult(result: RunIndexProjectGraphResult): string {
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

  lines.push('  phases:')
  const phaseMetrics = Object.entries(result.phaseMetrics) as Array<[string, IndexPhaseMetric]>
  for (const [phase, metric] of phaseMetrics) {
    lines.push(
      `    ${phase}: ${String(metric.count)} item(s), ${String(Math.round(metric.durationMs))}ms`,
    )
  }

  if (result.fullRebuild) {
    lines.push(`  full rebuild: yes (${result.fullRebuildReason ?? 'FORCED'})`)
  } else {
    lines.push('  full rebuild: no')
  }

  for (const error of result.errors) {
    lines.push(`    ${error.filePath}: ${error.message}`)
  }

  return lines.join('\n')
}
