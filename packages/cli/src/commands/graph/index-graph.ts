import { Command, Option } from 'commander'
import {
  runIsolatedGraphIndex,
  type IndexPhaseMetric,
  type RunIndexProjectGraphResult,
} from '@specd/sdk'
import type {
  CliGraphIndexContextDescriptor,
  CliGraphIndexProgress,
  CliGraphIndexTaskInput,
} from '../../graph-index-task.js'
import { output, parseFormat } from '../../formatter.js'
import { cliError } from '../../handle-error.js'
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
    coverage: { total: number, byStatus: Record<string, number>, reasons: string[] }
    coverageDiagnostics: Array<{ specId, filePath, symbolName?, reason }>
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

        let taskContext: CliGraphIndexContextDescriptor
        if (context.mode === 'configured') {
          if (context.configFilePath === null) {
            cliError('configured graph context is missing its config file path', opts.format, 1)
          }
          taskContext = { mode: 'configured', configFilePath: context.configFilePath }
        } else {
          if (context.vcsRoot === null) {
            cliError('bootstrap graph context is missing its VCS root', opts.format, 1)
          }
          taskContext = {
            mode: 'bootstrap',
            projectRoot: context.projectRoot,
            vcsRoot: context.vcsRoot,
          }
        }

        try {
          const taskInput: CliGraphIndexTaskInput = {
            context: taskContext,
            index: {
              force: opts.force,
              ...(opts.excludePath !== undefined ? { excludePaths: opts.excludePath } : {}),
            },
          }
          const result = await runIsolatedGraphIndex<
            CliGraphIndexTaskInput,
            CliGraphIndexProgress,
            RunIndexProjectGraphResult
          >({
            storageRoot: context.config.configPath,
            taskModule: new URL('./graph-index-task.js', import.meta.url),
            taskInput,
            ...(fmt === 'text'
              ? {
                  onProgress: ({ percent, phase }) => {
                    const pct = Math.round(percent)
                    process.stdout.write(`\rIndexing: ${pct}% ${phase}${' '.repeat(20)}`)
                  },
                }
              : {}),
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

  lines.push(`  coverage:   ${String(result.coverage.total)} input(s)`)
  for (const status of ['indexed', 'excluded', 'unsupported', 'parse-failed', 'partial'] as const) {
    lines.push(`    ${status}: ${String(result.coverage.byStatus[status] ?? 0)}`)
  }
  for (const reason of result.coverage.reasons) {
    lines.push(`    reason: ${reason}`)
  }
  if (result.coverageDiagnostics.length > 0) {
    lines.push('  coverage diagnostics:')
    for (const diagnostic of result.coverageDiagnostics) {
      lines.push(
        `    ${diagnostic.specId}: ${diagnostic.filePath}${diagnostic.symbolName === undefined ? '' : `#${diagnostic.symbolName}`} (${diagnostic.reason})`,
      )
    }
  }

  for (const error of result.errors) {
    lines.push(`    ${error.filePath}: ${error.message}`)
  }

  return lines.join('\n')
}
