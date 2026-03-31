import { Command, Option } from 'commander'
import { DEFAULT_HOTSPOT_KINDS, type HotspotOptions, type RiskLevel } from '@specd/code-graph'
import { output, parseFormat } from '../../formatter.js'
import { cliError } from '../../handle-error.js'
import { parseGraphKinds } from './parse-graph-kinds.js'
import { resolveGraphCliContext } from './resolve-graph-cli-context.js'
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

const DEFAULT_HOTSPOT_KIND_LIST = (DEFAULT_HOTSPOT_KINDS ?? ['class', 'method', 'function']).join(
  ',',
)

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
        `Defaults (no flags): kinds ${DEFAULT_HOTSPOT_KIND_LIST}, score > 0, risk >= MEDIUM, limit 20.\n` +
        'Default view excludes importer-only symbols unless widened with --include-importer-only.\n' +
        'Each option overrides only its own default.',
    )
    .option('--workspace <name>', 'filter by workspace')
    .addOption(
      new Option(
        '--kind <kinds>',
        `filter by symbol kind (comma-separated); replaces default kinds ${DEFAULT_HOTSPOT_KIND_LIST}`,
      ),
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
    .option('--limit <n>', 'max results (default 20)')
    .option('--min-score <n>', 'minimum score threshold (default 1)')
    .option(
      '--include-importer-only',
      'include symbols with no direct callers whose score comes only from file importers',
    )
    .addOption(
      new Option('--min-risk <level>', 'minimum risk level (default MEDIUM)').choices([
        'LOW',
        'MEDIUM',
        'HIGH',
        'CRITICAL',
      ]),
    )
    .option('--config <path>', 'path to specd.yaml')
    .option('--path <path>', 'repository root for bootstrap mode')
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
  specd graph hotspots --exclude-path "*:test/*"
  specd graph hotspots --exclude-workspace cli --exclude-workspace mcp
  specd graph hotspots --exclude-path "*.spec.ts" --min-risk HIGH

  Default hotspot view:
  Uses kinds ${DEFAULT_HOTSPOT_KIND_LIST}
  Keeps risk >= MEDIUM and limit 20 unless you override them
  Excludes symbols with no direct callers even if their file is widely imported
  Passing --kind replaces the default kind set instead of merging with it
  Passing --include-importer-only explicitly widens the query to importer-only symbols
`,
    )
    .action(
      async (opts: {
        workspace?: string
        kind?: string
        config?: string
        path?: string
        file?: string
        excludePath: string[]
        excludeWorkspace: string[]
        limit?: string
        minScore?: string
        minRisk?: string
        includeImporterOnly?: boolean
        format: string
      }) => {
        const fmt = parseFormat(opts.format)
        if (opts.config !== undefined && opts.path !== undefined) {
          cliError('--config and --path are mutually exclusive', opts.format, 1)
        }
        const kinds = (() => {
          try {
            return parseGraphKinds(opts.kind)
          } catch (err) {
            cliError(err instanceof Error ? err.message : 'invalid --kind value', opts.format, 1)
          }
        })()
        const { config } = await resolveGraphCliContext({
          configPath: opts.config,
          repoPath: opts.path,
        }).catch((err: unknown) =>
          cliError(
            err instanceof Error ? err.message : 'failed to resolve graph context',
            opts.format,
            1,
          ),
        )

        await withProvider(config, opts.format, async (provider) => {
          const options: HotspotOptions = {
            ...(opts.workspace ? { workspace: opts.workspace } : undefined),
            ...(kinds !== undefined ? { kinds } : undefined),
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
            ...(opts.includeImporterOnly === true ? { includeImporterOnly: true } : undefined),
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
              const sepIndex = entry.symbol.filePath.indexOf(':')
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
                  workspace: (() => {
                    const idx = e.symbol.filePath.indexOf(':')
                    return idx !== -1 ? e.symbol.filePath.substring(0, idx) : ''
                  })(),
                })),
              },
              fmt,
            )
          }
        })
      },
    )
}
