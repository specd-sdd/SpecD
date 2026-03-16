import { Command } from 'commander'
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
  }
`,
    )
    .action(async (opts: { format: string }) => {
      const fmt = parseFormat(opts.format)
      const { config } = await resolveCliContext()

      await withProvider(config, opts.format, async (provider) => {
        const stats = await provider.getStatistics()

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

          output(lines.join('\n'), 'text')
        } else {
          output(stats, fmt)
        }
      })
    })
}
