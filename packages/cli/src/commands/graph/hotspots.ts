import { Command, Option } from 'commander'
import { type HotspotOptions, type RiskLevel, SymbolKind } from '@specd/code-graph'
import { output, parseFormat } from '../../formatter.js'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { withProvider } from './with-provider.js'

/**
 * Collects repeatable option values into an array.
 * @param value - The new value.
 * @param previous - The accumulated array.
 * @returns The updated array.
 */
function collect(value: string, previous: string[]): string[] {
  return [...previous, value]
}

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
        'Defaults (no flags): score > 0, risk >= MEDIUM, limit 20.\n' +
        'Any filter flag removes all defaults — only explicit constraints apply.',
    )
    .option('--workspace <name>', 'filter by workspace')
    .addOption(
      new Option('--kind <kind>', 'filter by symbol kind').choices(Object.values(SymbolKind)),
    )
    .option('--file <path>', 'filter by file path')
    .option(
      '--exclude-path <pattern>',
      'exclude symbols whose file path matches glob pattern (supports * wildcards, case-insensitive, repeatable)',
      collect,
      [],
    )
    .option(
      '--exclude-workspace <name>',
      'exclude results from workspace (repeatable)',
      collect,
      [],
    )
    .option('--limit <n>', 'max results (default 20 when no filters)')
    .option('--min-score <n>', 'minimum score threshold (default 1 when no filters)')
    .addOption(
      new Option(
        '--min-risk <level>',
        'minimum risk level (default MEDIUM when no filters)',
      ).choices(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    )
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

Exclude examples:
  specd graph hotspots --exclude-path "test/*"
  specd graph hotspots --exclude-workspace cli --exclude-workspace mcp
  specd graph hotspots --exclude-path "*.spec.ts" --min-risk HIGH
`,
    )
    .action(
      async (opts: {
        workspace?: string
        kind?: string
        file?: string
        excludePath: string[]
        excludeWorkspace: string[]
        limit?: string
        minScore?: string
        minRisk?: string
        format: string
      }) => {
        const fmt = parseFormat(opts.format)
        const { config } = await resolveCliContext()

        await withProvider(config, opts.format, async (provider) => {
          const hasAnyFilter = !!(
            opts.workspace ||
            opts.kind ||
            opts.file ||
            opts.excludePath.length > 0 ||
            opts.excludeWorkspace.length > 0 ||
            opts.limit !== undefined ||
            opts.minScore !== undefined ||
            opts.minRisk !== undefined
          )

          // When no filters are provided, apply safe defaults.
          // Any filter removes all defaults — only explicit constraints apply.
          const base: HotspotOptions = hasAnyFilter
            ? { minScore: 0, minRisk: 'LOW', limit: Infinity }
            : {}

          const options: HotspotOptions = {
            ...base,
            ...(opts.workspace ? { workspace: opts.workspace } : undefined),
            ...(opts.kind ? { kind: opts.kind as SymbolKind } : undefined),
            ...(opts.file ? { filePath: opts.file } : undefined),
            ...(opts.excludePath.length > 0 ? { excludePaths: opts.excludePath } : undefined),
            ...(opts.excludeWorkspace.length > 0
              ? { excludeWorkspaces: opts.excludeWorkspace }
              : undefined),
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
              const sepIndex = entry.symbol.filePath.indexOf('/')
              const ws = sepIndex !== -1 ? entry.symbol.filePath.substring(0, sepIndex) : ''
              const relPath =
                sepIndex !== -1
                  ? entry.symbol.filePath.substring(sepIndex + 1)
                  : entry.symbol.filePath
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
                  workspace:
                    e.symbol.filePath.indexOf('/') !== -1
                      ? e.symbol.filePath.substring(0, e.symbol.filePath.indexOf('/'))
                      : '',
                })),
              },
              fmt,
            )
          }
        })
      },
    )
}
