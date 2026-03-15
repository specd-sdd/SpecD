import { Command } from 'commander'
import { output, parseFormat } from '../../formatter.js'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { withProvider } from './with-provider.js'

/**
 * Registers the `graph find` command.
 * @param parent - The parent commander command.
 */
export function registerGraphFind(parent: Command): void {
  parent
    .command('find')
    .allowExcessArguments(false)
    .description('Search symbols in the code graph')
    .option('--name <pattern>', 'symbol name (supports * wildcards)')
    .option('--kind <kind>', 'symbol kind: function|class|method|variable|type|interface|enum')
    .option('--file <path>', 'filter by file path (supports * wildcards)')
    .option('--comment <text>', 'search in symbol comments (substring match)')
    .option('--case-sensitive', 'use case-sensitive matching for name and comment')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .action(
      async (opts: {
        name?: string
        kind?: string
        file?: string
        comment?: string
        caseSensitive?: boolean
        format: string
      }) => {
        const fmt = parseFormat(opts.format)
        const { config } = await resolveCliContext()

        await withProvider(config, opts.format, async (provider) => {
          const query: Record<string, unknown> = {}
          if (opts.name) query['name'] = opts.name
          if (opts.kind) query['kind'] = opts.kind
          if (opts.file) query['filePath'] = opts.file
          if (opts.comment) query['comment'] = opts.comment
          if (opts.caseSensitive) query['caseSensitive'] = true
          const symbols = await provider.findSymbols(query)

          if (fmt === 'text') {
            if (symbols.length === 0) {
              output('No symbols found.', 'text')
            } else {
              const lines = [`${String(symbols.length)} symbol(s) found:\n`]
              for (const s of symbols) {
                const comment = s.comment ? ` — ${s.comment.substring(0, 60)}` : ''
                lines.push(`  ${s.kind} ${s.name}  ${s.filePath}:${String(s.line)}${comment}`)
              }
              output(lines.join('\n'), 'text')
            }
          } else {
            output(symbols, fmt)
          }
        })
      },
    )
}
