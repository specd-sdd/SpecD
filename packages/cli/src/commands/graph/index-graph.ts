import { Command, Option } from 'commander'
import {
  GraphIndexWorkerError,
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

/** Maximum number of skipped files listed in CLI text output. */
/** Maximum number of workspace overlaps listed in text output. */
const CLI_OVERLAP_LIST_MAX = 10

const CLI_SIZE_SKIP_LIST_MAX = 10

/**
 * Formats a byte count into a human-readable size string.
 * @param bytes - Byte count.
 * @returns Human-readable size (e.g., '512 B', '256 KB', '1.5 MB'); kilobytes are rounded up.
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1048576) {
    // Round up so a file above a limit never prints as equal to it.
    return `${Math.ceil(bytes / 1024)} KB`
  }
  return `${(bytes / 1048576).toFixed(1)} MB`
}

/**
 * Escapes a project-relative path so it can be safely placed in a gitignore pattern list.
 * @param path - Project-relative path.
 * @returns Escaped gitignore pattern.
 */
export function escapeGitignorePattern(path: string): string {
  let escaped = path
    .replaceAll('\\', '\\\\')
    .replaceAll('*', '\\*')
    .replaceAll('?', '\\?')
    .replaceAll('[', '\\[')
    .replaceAll(']', '\\]')

  if (escaped.startsWith('!') || escaped.startsWith('#') || escaped.startsWith(' ')) {
    escaped = `\\${escaped}`
  }
  if (escaped.endsWith(' ') && escaped !== '\\ ') {
    escaped = `${escaped.slice(0, -1)}\\ `
  }
  return escaped
}

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
        'one or more gitignore-syntax patterns, relative to the project root, added to the global exclusion layer',
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
    filesSkippedForSize: number
    largestSkippedForSize: Array<{ filePath, projectRelativePath, sizeBytes, limitBytes }>
    sizeExemptAnalysed: Array<{ filePath, projectRelativePath, sizeBytes }>
    filesRemoved: number
    specsDiscovered: number
    specsIndexed: number
    errors: Array<{ filePath, message }>
    diagnostics: Array<{ filePath, message }>
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

        const discoveryStartDir = process.cwd()
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
          taskContext =
            opts.config !== undefined
              ? { mode: 'forced', configPath: context.configFilePath }
              : { mode: 'discovered', startDir: discoveryStartDir }
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
                  onProgress: (progress) => {
                    if ('event' in progress) {
                      if (progress.event.kind === 'resource-disposal-failed') {
                        process.stderr.write(
                          `warning: could not release a parser resource while processing ${progress.event.filePath}: ${progress.event.message}\n`,
                        )
                      }
                      return
                    }
                    const pct = Math.round(progress.percent)
                    process.stdout.write(`\rIndexing: ${pct}% ${progress.phase}${' '.repeat(20)}`)
                  },
                  onEvent: (event) => {
                    if (event.kind === 'worker-silent') {
                      process.stderr.write(
                        `\nwarning: no progress for ${Math.round(event.silentForMs / 1000)}s${event.item !== null ? ` while processing ${event.item}` : ''}. If that file is not needed, add it to graph.excludePaths or lower graph.maxFileBytes.\n`,
                      )
                    }
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
        } catch (err) {
          if (!(err instanceof GraphIndexWorkerError) || err.diagnostics === undefined) {
            cliError(err instanceof Error ? err.message : 'indexing failed', opts.format, 3)
          } else {
            const d = err.diagnostics
            const detail =
              fmt === 'text'
                ? [
                    `cause: ${d.cause}`,
                    d.lastActivity
                      ? `last file: ${d.lastActivity.item} (${Math.round(d.lastActivity.agoMs / 1000)}s before the failure)`
                      : null,
                    d.stderrTail !== '' ? `--- worker stderr (tail) ---\n${d.stderrTail}` : null,
                  ]
                    .filter((line): line is string => line !== null)
                    .join('\n')
                : undefined
            cliError(err.message, opts.format, 3, 'CLI_ERROR', {
              ...(detail !== undefined ? { detail } : {}),
              metadata: {
                cause: d.cause,
                lastActivity: d.lastActivity,
                stdoutTail: d.stdoutTail,
                stderrTail: d.stderrTail,
              },
            })
          }
        }
        // Ends the process explicitly after a successful run. It sits outside the try block so that
        // a host which makes process.exit throw cannot route that exit into the error handler above.
        process.exit(0)
      },
    )
}

/**
 * Builds the `graph.largeFilePaths` entry that exempts exactly one project-relative file.
 *
 * A gitignore pattern without a slash matches at any depth, so a root-level file is anchored with
 * a leading `/`. Paths that contain a slash are already anchored to the project root.
 * @param path - Project-relative path of the file.
 * @returns A gitignore-syntax pattern that matches only that file.
 */
export function toLargeFilePathsEntry(path: string): string {
  return path.includes('/') ? escapeGitignorePattern(path) : `/${escapeGitignorePattern(path)}`
}

/**
 * Renders a string as a YAML scalar, single-quoting it when a plain scalar would be misread.
 * @param value - Scalar text.
 * @returns The plain text, or a single-quoted scalar with embedded quotes doubled.
 */
export function yamlScalar(value: string): string {
  const needsQuotes =
    value === '' ||
    /^[\s\-?:,[\]{}#&*!|>'"%@`]/.test(value) ||
    /\s$/.test(value) ||
    value.includes(': ') ||
    value.includes(' #') ||
    value.endsWith(':')
  return needsQuotes ? `'${value.replaceAll("'", "''")}'` : value
}

/**
 * Formats an index result according to the text-mode CLI contract.
 *
 * @param result - The completed indexing result.
 * @returns Human-readable text output.
 */
export function formatTextIndexResult(result: RunIndexProjectGraphResult): string {
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

  if (result.diagnostics.length > 0) {
    lines.push(`  finished with ${String(result.diagnostics.length)} diagnostic(s):`)
    for (const diagnostic of result.diagnostics) {
      lines.push(`    warning: ${diagnostic.filePath}: ${diagnostic.message}`)
    }
  }

  if (result.filesSkippedForSize > 0) {
    const distinctLimits = [...new Set(result.largestSkippedForSize.map((f) => f.limitBytes))]
    const limitsLabel = distinctLimits.join(', ')
    lines.push(
      `  size limit: ${String(result.filesSkippedForSize)} file(s) skipped (larger than graph.maxFileBytes, ${limitsLabel} bytes)`,
    )
    const listed = result.largestSkippedForSize.slice(0, CLI_SIZE_SKIP_LIST_MAX)
    for (const file of listed) {
      lines.push(`    ${file.projectRelativePath}   ${formatSize(file.sizeBytes)}`)
    }
    if (result.filesSkippedForSize > listed.length) {
      const remaining = result.filesSkippedForSize - listed.length
      lines.push(`    ... and ${String(remaining)} more`)
    }
    lines.push('  to index them anyway, add to specd.yaml:')
    lines.push('    graph:')
    lines.push('      largeFilePaths:')
    for (const file of listed) {
      lines.push(`        - ${yamlScalar(toLargeFilePathsEntry(file.projectRelativePath))}`)
    }
    lines.push('  or raise graph.maxFileBytes (0 disables the limit).')
    lines.push('  large files cost roughly 3 KB of memory per source byte while they are analysed.')
  }

  if (result.workspaceOverlapCount > 0) {
    lines.push(
      `  workspace overlap: ${String(result.workspaceOverlapCount)} file(s) are indexed by more than one workspace`,
    )
    const listedOverlaps = result.workspaceOverlaps.slice(0, CLI_OVERLAP_LIST_MAX)
    for (const overlap of listedOverlaps) {
      lines.push(`    ${overlap.projectRelativePath} — ${overlap.workspaces.join(', ')}`)
    }
    if (result.workspaceOverlapCount > listedOverlaps.length) {
      lines.push(`    ... and ${String(result.workspaceOverlapCount - listedOverlaps.length)} more`)
    }
    lines.push(
      '  review graph.excludePaths and workspace allowedPaths/excludePaths, and run `specd graph why <path>` to see which workspaces index a file.',
    )
  }

  if (result.sizeExemptAnalysed.length > 0) {
    lines.push('  size-exempt files analysed:')
    for (const file of result.sizeExemptAnalysed) {
      lines.push(`    ${file.projectRelativePath}   ${formatSize(file.sizeBytes)}`)
    }
  }

  return lines.join('\n')
}
