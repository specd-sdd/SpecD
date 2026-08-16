import { Command } from 'commander'
import { openSpecdHost, withOpenGraphProvider } from '@specd/sdk'
import { output, parseFormat } from '../../formatter.js'
import { cliError } from '../../handle-error.js'

/**
 * Registers the `graph stats` command.
 * @param parent - The parent commander command.
 */
export function registerGraphStats(parent: Command): void {
  parent
    .command('stats')
    .allowExcessArguments(false)
    .description('Show code graph statistics')
    .option('--config <path>', 'path to specd.yaml')
    .option('--path <path>', 'repository root for bootstrap mode')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  {
    fileCount: number
    documentCount: number
    symbolCount: number
    specCount: number
    relationCounts: Record<RelationType, number>
    languages: string[]
    lastIndexedAt?: string
    lastIndexedRef?: string | null
    stale: boolean | null
    currentRef: string | null
    fingerprintMismatch: boolean | null
  }
`,
    )
    .action(async (opts: { config?: string; path?: string; format: string }) => {
      const fmt = parseFormat(opts.format)
      if (opts.config !== undefined && opts.path !== undefined) {
        cliError('--config and --path are mutually exclusive', opts.format, 1)
      }
      const hostInput =
        opts.config !== undefined
          ? { configPath: opts.config }
          : opts.path !== undefined
            ? { startDir: opts.path, allowBootstrapFallback: true }
            : { allowBootstrapFallback: true }
      const host = await openSpecdHost(hostInput).catch((err: unknown) =>
        cliError(
          err instanceof Error ? err.message : 'failed to resolve graph host',
          opts.format,
          1,
        ),
      )
      await withOpenGraphProvider(host, async (provider) => {
        const health = await provider.getGraphHealth()

        const {
          stale,
          currentRef,
          fingerprintMismatch,
          state,
          knownStaleSinceLastIndex,
          workspaces,
          contentFresh,
          coverageComplete,
          coverage,
          schemaCompatible,
          generationCurrent,
          reasonCodes,
          ...stats
        } = health
        const coverageSummary = coverage ?? {
          total: 0,
          byStatus: {
            indexed: 0,
            excluded: 0,
            unsupported: 0,
            'parse-failed': 0,
            partial: 0,
          },
          reasons: [],
        }
        const workspaceHealth = workspaces ?? []
        const aggregateState = state ?? 'unknown'
        const aggregateLatch = knownStaleSinceLastIndex ?? false

        if (fmt === 'text') {
          const lines = [
            `Files:     ${String(stats.fileCount)}`,
            `Documents: ${String(stats.documentCount)}`,
            `Symbols:   ${String(stats.symbolCount)}`,
            `Specs:     ${String(stats.specCount)}`,
            `Languages: ${stats.languages.join(', ') || 'none'}`,
          ]

          const relEntries = Object.entries(stats.relationCounts).filter(([, count]) => count > 0)
          if (relEntries.length > 0) {
            lines.push('Relations:')
            for (const [type, count] of relEntries) {
              lines.push(`  ${type}: ${String(count)}`)
            }
          }

          if (stats.lastIndexedAt) {
            lines.push(`Last indexed: ${stats.lastIndexedAt}`)
          }

          lines.push(`Content fresh:    ${String(contentFresh)}`)
          lines.push(`Graph state:      ${aggregateState}`)
          lines.push(`Known stale:      ${String(aggregateLatch)}`)
          lines.push(`Coverage complete: ${String(coverageComplete)}`)
          lines.push(
            `Coverage: indexed=${String(coverageSummary.byStatus.indexed)}, excluded=${String(coverageSummary.byStatus.excluded)}, unsupported=${String(coverageSummary.byStatus.unsupported)}, parse-failed=${String(coverageSummary.byStatus['parse-failed'])}, partial=${String(coverageSummary.byStatus.partial)}`,
          )
          lines.push(`Schema compatible: ${String(schemaCompatible)}`)
          lines.push(`Generation current: ${String(generationCurrent)}`)
          const nonCurrentWorkspaces = workspaceHealth.filter(
            (workspace) => workspace.state !== 'current',
          )
          if (nonCurrentWorkspaces.length > 0) {
            lines.push('Non-current workspaces:')
            for (const workspace of nonCurrentWorkspaces) {
              lines.push(
                `  ${workspace.workspace}: ${workspace.state} (${workspace.mode}) ${workspace.reasons.join(', ')}`,
              )
            }
          }
          if (reasonCodes.length > 0) {
            lines.push('Health reasons:')
            for (const reason of reasonCodes) lines.push(`  ${reason}`)
          }

          output(lines.join('\n'), 'text')
        } else {
          output(
            {
              ...stats,
              stale,
              currentRef,
              fingerprintMismatch,
              state: aggregateState,
              knownStaleSinceLastIndex: aggregateLatch,
              workspaces: workspaceHealth,
              contentFresh,
              coverageComplete,
              coverage: coverageSummary,
              schemaCompatible,
              generationCurrent,
              reasonCodes,
            },
            fmt,
          )
        }
      })
      process.exit(0)
    })
}
