import { Command } from 'commander'
import { output, parseFormat } from '../../formatter.js'
import { cliError } from '../../handle-error.js'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { withProvider } from './with-provider.js'

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
    .option(
      '--kind <kind>',
      'filter symbols by kind (function|class|method|variable|type|interface|enum)',
    )
    .option('--file <path>', 'filter symbols by file path (supports * wildcards)')
    .option('--workspace <name>', 'filter results by workspace')
    .option('--limit <n>', 'max results per category', '10')
    .option('--spec-content', 'include full spec content (only with --format json|toon)')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .action(
      async (
        query: string,
        opts: {
          symbols?: boolean
          specs?: boolean
          kind?: string
          file?: string
          workspace?: string
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
        const searchBoth = !opts.symbols && !opts.specs
        const { config } = await resolveCliContext()

        await withProvider(config, opts.format, async (provider) => {
          // Fetch more results than needed so we can filter, then trim to limit
          const fetchLimit = limit * 5

          let symbolResults =
            searchBoth || opts.symbols ? await provider.searchSymbols(query, fetchLimit) : []
          let specResults =
            searchBoth || opts.specs ? await provider.searchSpecs(query, fetchLimit) : []

          // Apply post-FTS filters
          if (opts.kind) {
            symbolResults = symbolResults.filter((r) => r.symbol.kind === opts.kind)
          }
          if (opts.file) {
            const pattern = opts.file.replaceAll('.', '\\.').replaceAll('*', '.*')
            const re = new RegExp(pattern, 'i')
            symbolResults = symbolResults.filter((r) => re.test(r.symbol.filePath))
          }
          if (opts.workspace) {
            symbolResults = symbolResults.filter((r) =>
              r.symbol.filePath.startsWith(opts.workspace + '/'),
            )
            specResults = specResults.filter((r) => r.spec.workspace === opts.workspace)
          }

          // Trim to limit after filtering
          symbolResults = symbolResults.slice(0, limit)
          specResults = specResults.slice(0, limit)

          if (fmt === 'text') {
            const lines: string[] = []

            if (symbolResults.length > 0) {
              lines.push(`Symbols (${String(symbolResults.length)}):`)
              for (const { symbol, score } of symbolResults) {
                const ws = symbol.filePath.substring(0, symbol.filePath.indexOf('/'))
                const relPath = symbol.filePath.substring(symbol.filePath.indexOf('/') + 1)
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
                  workspace: symbol.filePath.substring(0, symbol.filePath.indexOf('/')),
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
