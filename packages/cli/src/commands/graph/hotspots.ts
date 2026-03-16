import { Command } from 'commander'
import { type HotspotOptions, type RiskLevel, SymbolKind } from '@specd/code-graph'
import { output, parseFormat } from '../../formatter.js'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { withProvider } from './with-provider.js'

/**
 * Registers the `graph hotspots` command.
 * @param parent - The parent commander command.
 */
export function registerGraphHotspots(parent: Command): void {
  parent
    .command('hotspots')
    .allowExcessArguments(false)
    .description(
      'Rank symbols by impact score (callers, importers, cross-workspace deps).\n' +
        'Defaults: score > 0, risk >= MEDIUM, limit 20. Use --all to remove all defaults.',
    )
    .option('--workspace <name>', 'filter by workspace')
    .option(
      '--kind <kind>',
      'filter by symbol kind (function|class|method|variable|type|interface|enum)',
    )
    .option('--file <path>', 'filter by file path')
    .option('--limit <n>', 'max results (default 20)')
    .option('--min-score <n>', 'minimum score threshold (default 1)')
    .option('--min-risk <level>', 'minimum risk level: LOW|MEDIUM|HIGH|CRITICAL (default MEDIUM)')
    .option('--all', 'remove all default filters (score, risk, limit)')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  {
    totalSymbols: number
    entries: Array<{
      symbol: { id, name, kind, filePath, line, column, comment }
      score: number
      directCallers: number
      crossWorkspaceCallers: number
      fileImporters: number
      riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
      workspace: string
    }>
  }
`,
    )
    .action(
      async (opts: {
        workspace?: string
        kind?: string
        file?: string
        limit?: string
        minScore?: string
        minRisk?: string
        all?: boolean
        format: string
      }) => {
        const fmt = parseFormat(opts.format)
        const { config } = await resolveCliContext()

        await withProvider(config, opts.format, async (provider) => {
          const allDefaults: HotspotOptions = opts.all
            ? { minScore: 0, minRisk: 'LOW', limit: Infinity }
            : {}

          const options: HotspotOptions = {
            ...allDefaults,
            // Individual overrides take precedence over --all
            ...(opts.workspace ? { workspace: opts.workspace } : undefined),
            ...(opts.kind ? { kind: opts.kind as SymbolKind } : undefined),
            ...(opts.file ? { filePath: opts.file } : undefined),
            ...(opts.limit !== undefined ? { limit: parseInt(opts.limit, 10) } : undefined),
            ...(opts.minScore !== undefined
              ? { minScore: parseInt(opts.minScore, 10) }
              : undefined),
            ...(opts.minRisk !== undefined ? { minRisk: opts.minRisk as RiskLevel } : undefined),
          }

          const result = await provider.getHotspots(options)

          if (fmt === 'text') {
            if (result.entries.length === 0) {
              output('No hotspots found.', 'text')
              return
            }

            const lines: string[] = []
            lines.push(
              `Hotspots (${String(result.entries.length)} of ${String(result.totalSymbols)} symbols):`,
            )
            lines.push('')

            // Header
            lines.push(
              `${'Score'.padStart(6)}  ${'Risk'.padEnd(8)}  ${'XWS'.padStart(3)}  ${'Kind'.padEnd(9)}  ${'Name'.padEnd(30)}  File`,
            )
            lines.push('─'.repeat(90))

            for (const entry of result.entries) {
              const ws = entry.symbol.filePath.substring(0, entry.symbol.filePath.indexOf('/'))
              const relPath = entry.symbol.filePath.substring(
                entry.symbol.filePath.indexOf('/') + 1,
              )
              lines.push(
                `${String(entry.score).padStart(6)}  ${entry.riskLevel.padEnd(8)}  ${String(entry.crossWorkspaceCallers).padStart(3)}  ${entry.symbol.kind.padEnd(9)}  ${entry.symbol.name.padEnd(30)}  [${ws}] ${relPath}:${String(entry.symbol.line)}`,
              )
            }

            output(lines.join('\n'), 'text')
          } else {
            output(
              {
                totalSymbols: result.totalSymbols,
                entries: result.entries.map((e) => ({
                  symbol: e.symbol,
                  score: e.score,
                  directCallers: e.directCallers,
                  crossWorkspaceCallers: e.crossWorkspaceCallers,
                  fileImporters: e.fileImporters,
                  riskLevel: e.riskLevel,
                  workspace: e.symbol.filePath.substring(0, e.symbol.filePath.indexOf('/')),
                })),
              },
              fmt,
            )
          }
        })
      },
    )
}
