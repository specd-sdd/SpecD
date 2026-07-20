import { Command, Option } from 'commander'
import { runIndexProjectGraph, type IndexResult } from '@specd/sdk'
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
    fullRebuildReason: string | null
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
