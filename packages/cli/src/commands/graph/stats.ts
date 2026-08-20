import { Command } from 'commander'
import { output, parseFormat } from '../../formatter.js'
import { cliError } from '../../handle-error.js'
import { resolveGraphCliContext } from './resolve-graph-cli-context.js'
import { withProvider } from './with-provider.js'

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
      const { config, kernel } = await resolveGraphCliContext({
        configPath: opts.config,
        repoPath: opts.path,
      }).catch((err: unknown) =>
        cliError(
          err instanceof Error ? err.message : 'failed to resolve graph context',
          opts.format,
          1,
        ),
      )
      await withProvider(
        config,
        opts.format,
        async (provider) => {
          const health = await provider.getGraphHealth()

          const {
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
            if (
              coverageComplete !== true ||
              contentFresh !== true ||
              aggregateState !== 'current'
            ) {
              lines.push(
                'Symbol absence cannot be proven while graph coverage or freshness is incomplete.',
              )
            }
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
            output(health, fmt)
          }
        },
        { kernel },
      )
    })
}
