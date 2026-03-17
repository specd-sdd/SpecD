import { Command, Option } from 'commander'
import { type SearchOptions, SymbolKind } from '@specd/code-graph'
import { output, parseFormat } from '../../formatter.js'
import { cliError } from '../../handle-error.js'
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
 * Registers the `graph search` command.
 * @param parent - The parent commander command.
 */
export function registerGraphSearch(parent: Command): void {
  parent
    .command('search <query>')
    .allowExcessArguments(false)
    .description('Full-text search across symbols and specs')
    .option('--symbols', 'search only symbols')
    .option('--specs', 'search only specs')
    .addOption(
      new Option('--kind <kind>', 'filter symbols by kind').choices(Object.values(SymbolKind)),
    )
    .option('--file <path>', 'filter symbols by file path (supports * wildcards)')
    .option('--workspace <name>', 'filter results by workspace')
    .option(
      '--exclude-path <pattern>',
      'exclude symbols/specs whose file path matches glob pattern (supports * wildcards, case-insensitive, repeatable)',
      collect,
      [],
    )
    .option(
      '--exclude-workspace <name>',
      'exclude results from workspace (repeatable)',
      collect,
      [],
    )
    .option('--limit <n>', 'max results per category', '10')
    .option('--spec-content', 'include full spec content (only with --format json|toon)')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  {
    symbols: Array<{
      workspace: string
      symbol: { id, name, kind, filePath, line, column, comment }
      score: number
    }>
    specs: Array<{
      workspace: string
      specId: string
      path: string
      title: string
      description: string
      content?: string
      score: number
    }>
  }

Exclude examples:
  specd graph search "handle" --exclude-path "test/*"
  specd graph search "config" --exclude-workspace cli --exclude-workspace mcp
  specd graph search "create" --exclude-path "*.spec.ts" --exclude-path "test/*"
`,
    )
    .action(
      async (
        query: string,
        opts: {
          symbols?: boolean
          specs?: boolean
          kind?: string
          file?: string
          workspace?: string
          excludePath: string[]
          excludeWorkspace: string[]
          specContent?: boolean
          limit: string
          format: string
        },
      ) => {
        const fmt = parseFormat(opts.format)
        if (opts.specContent && fmt === 'text') {
          cliError('--spec-content requires --format json or --format toon', opts.format, 1)
        }
        const limit = parseInt(opts.limit, 10)
        if (Number.isNaN(limit) || limit <= 0) {
          cliError('--limit must be a positive integer', opts.format)
        }
        if (
          opts.kind &&
          !['function', 'class', 'method', 'variable', 'type', 'interface', 'enum'].includes(
            opts.kind,
          )
        ) {
          cliError(
            `--kind must be one of: function, class, method, variable, type, interface, enum (got '${opts.kind}')`,
            opts.format,
          )
        }
        const searchBoth = !opts.symbols && !opts.specs
        const { config } = await resolveCliContext()

        await withProvider(config, opts.format, async (provider) => {
          const searchOptions: SearchOptions = {
            query,
            limit,
            ...(opts.kind ? { kind: opts.kind as SymbolKind } : undefined),
            ...(opts.file ? { filePattern: opts.file } : undefined),
            ...(opts.workspace ? { workspace: opts.workspace } : undefined),
            ...(opts.excludePath.length > 0 ? { excludePaths: opts.excludePath } : undefined),
            ...(opts.excludeWorkspace.length > 0
              ? { excludeWorkspaces: opts.excludeWorkspace }
              : undefined),
          }

          const symbolResults =
            searchBoth || opts.symbols ? await provider.searchSymbols(searchOptions) : []
          const specResults =
            searchBoth || opts.specs ? await provider.searchSpecs(searchOptions) : []

          if (fmt === 'text') {
            const lines: string[] = []

            if (symbolResults.length > 0) {
              lines.push(`Symbols (${String(symbolResults.length)}):`)
              for (const { symbol, score } of symbolResults) {
                const sepIndex = symbol.filePath.indexOf('/')
                const ws = sepIndex !== -1 ? symbol.filePath.substring(0, sepIndex) : ''
                const relPath =
                  sepIndex !== -1 ? symbol.filePath.substring(sepIndex + 1) : symbol.filePath
                const comment = symbol.comment ? ` — ${symbol.comment.substring(0, 50)}` : ''
                lines.push(
                  `  ${score.toFixed(1).padStart(5)}  [${ws}] ${symbol.kind} ${symbol.name}  ${relPath}:${String(symbol.line)}${comment}`,
                )
              }
            }

            if (specResults.length > 0) {
              if (lines.length > 0) lines.push('')
              lines.push(`Specs (${String(specResults.length)}):`)
              for (const { spec, score } of specResults) {
                const desc = spec.description ? ` — ${spec.description.substring(0, 60)}` : ''
                lines.push(
                  `  ${score.toFixed(1).padStart(5)}  [${spec.workspace}] ${spec.specId}${desc}`,
                )
              }
            }

            if (lines.length === 0) {
              lines.push('No results found.')
            }

            output(lines.join('\n'), 'text')
          } else {
            output(
              {
                symbols: symbolResults.map(({ symbol, score }) => ({
                  workspace: symbol.filePath.includes('/')
                    ? symbol.filePath.substring(0, symbol.filePath.indexOf('/'))
                    : '',
                  symbol,
                  score,
                })),
                specs: specResults.map(({ spec, score }) => ({
                  workspace: spec.workspace,
                  specId: spec.specId,
                  path: spec.path,
                  title: spec.title,
                  description: spec.description,
                  ...(opts.specContent ? { content: spec.content } : {}),
                  score,
                })),
              },
              fmt,
            )
          }
        })
      },
    )
}
