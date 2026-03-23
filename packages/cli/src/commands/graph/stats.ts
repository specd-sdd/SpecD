import { Command } from 'commander'
import { createVcsAdapter } from '@specd/core'
import { output, parseFormat } from '../../formatter.js'
import { resolveCliContext } from '../../helpers/cli-context.js'
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
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  {
    fileCount: number
    symbolCount: number
    specCount: number
    relationCounts: Record<RelationType, number>
    languages: string[]
    lastIndexedAt?: string
    lastIndexedRef?: string | null
    stale: boolean | null
    currentRef: string | null
  }
`,
    )
    .action(async (opts: { format: string }) => {
      const fmt = parseFormat(opts.format)
      const { config } = await resolveCliContext()

      await withProvider(config, opts.format, async (provider) => {
        const stats = await provider.getStatistics()

        let currentRef: string | null = null
        try {
          const vcs = await createVcsAdapter(config.projectRoot)
          currentRef = await vcs.ref()
        } catch {
          // No VCS or ref() failed — staleness detection unavailable
        }

        const stale = computeStaleness(stats.lastIndexedRef, currentRef)

        if (fmt === 'text') {
          const lines = [
            `Files:     ${String(stats.fileCount)}`,
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

          if (stale === true && stats.lastIndexedRef !== null && currentRef !== null) {
            lines.push(
              `⚠ Graph is stale (indexed at ${stats.lastIndexedRef.slice(0, 7)}, current: ${currentRef.slice(0, 7)})`,
            )
          }

          output(lines.join('\n'), 'text')
        } else {
          output({ ...stats, stale, currentRef }, fmt)
        }
      })
    })
}

/**
 * Determines staleness from stored and current VCS refs.
 * @param lastIndexedRef - The VCS ref stored at last index time, or `null`.
 * @param currentRef - The current VCS ref, or `null`.
 * @returns `true` if stale, `false` if fresh, `null` if unknown.
 */
function computeStaleness(
  lastIndexedRef: string | null,
  currentRef: string | null,
): boolean | null {
  if (lastIndexedRef === null || currentRef === null) return null
  return lastIndexedRef !== currentRef
}
