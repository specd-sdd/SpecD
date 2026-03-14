import { Command } from 'commander'
import { createCodeGraphProvider } from '@specd/code-graph'
import { handleError } from '../../handle-error.js'
import { output, parseFormat } from '../../formatter.js'

/**
 * Registers the `graph stats` command.
 * @param parent - The parent commander command.
 */
export function registerGraphStats(parent: Command): void {
  parent
    .command('stats')
    .allowExcessArguments(false)
    .description('Show code graph statistics')
    .option('--path <path>', 'workspace root path', process.cwd())
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .action(async (opts: { path: string; format: string }) => {
      try {
        const fmt = parseFormat(opts.format)
        const provider = createCodeGraphProvider({ storagePath: opts.path })

        await provider.open()
        try {
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
        } finally {
          await provider.close()
        }
      } catch (err) {
        handleError(err, opts.format)
      }
    })
}
