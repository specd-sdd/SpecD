import { Command, Option } from 'commander'
import { type SearchOptions } from '@specd/code-graph'
import { output, parseFormat } from '../../formatter.js'
import { cliError } from '../../handle-error.js'
import { parseGraphKinds } from './parse-graph-kinds.js'
import { resolveGraphCliContext } from './resolve-graph-cli-context.js'
import { withProvider } from './with-provider.js'
import { assertGraphIndexUnlocked } from './graph-index-lock.js'
import { normalizeSnippet } from './normalize-snippet.js'

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
    .description('Full-text search across symbols, specs, and documents')
    .option('--symbols', 'search only symbols')
    .option('--specs', 'search only specs')
    .option('--documents', 'search only documents')
    .addOption(new Option('--kind <kinds>', 'filter symbols by kind (comma-separated)'))
    .option('--config <path>', 'path to specd.yaml')
    .option('--path <path>', 'repository root for bootstrap mode')
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
  specd graph search "handle" --exclude-path "*:test/*"
  specd graph search "config" --exclude-workspace cli --exclude-workspace mcp
  specd graph search "create" --exclude-path "*.spec.ts" --exclude-path "*:test/*"
`,
    )
    .action(
      async (
        query: string,
        opts: {
          symbols?: boolean
          specs?: boolean
          documents?: boolean
          kind?: string
          config?: string
          path?: string
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
        if (opts.config !== undefined && opts.path !== undefined) {
          cliError('--config and --path are mutually exclusive', opts.format, 1)
        }
        const searchBoth = !opts.symbols && !opts.specs && !opts.documents
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
        assertGraphIndexUnlocked(config)

        await withProvider(config, opts.format, async (provider) => {
          const searchOptions: SearchOptions = {
            query,
            limit,
            ...(kinds !== undefined ? { kinds } : undefined),
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
          const documentResults =
            searchBoth || opts.documents ? await provider.searchDocuments(searchOptions) : []

          const toDisplayPath = async (canonicalPath: string): Promise<string> => {
            const file = await provider.getFile(canonicalPath)
            if (file) return file.configRelativePath
            const document = await provider.getDocument(canonicalPath)
            if (document) return document.configRelativePath
            const idx = canonicalPath.indexOf(':')
            return idx === -1 ? canonicalPath : canonicalPath.substring(idx + 1)
          }

          if (fmt === 'text') {
            const lines: string[] = []

            if (symbolResults.length > 0) {
              lines.push(`Symbols (${String(symbolResults.length)} shown, limit ${String(limit)}):`)
              for (const { symbol, snippet, startLine, endLine } of symbolResults) {
                const sepIndex = symbol.filePath.indexOf(':')
                const ws = sepIndex !== -1 ? symbol.filePath.substring(0, sepIndex) : ''
                const relPath = await toDisplayPath(symbol.filePath)
                lines.push(`  [${ws}] ${symbol.kind} ${symbol.name}`)
                lines.push(`    ${relPath}:${String(symbol.line)}`)
                if (snippet) {
                  lines.push(`    snippet @ L${String(startLine)}-L${String(endLine)}:`)
                  lines.push('      >>>')
                  lines.push(normalizeSnippet(snippet, { margin: 6 }))
                  lines.push('      <<<')
                }
              }
            }

            if (specResults.length > 0) {
              if (lines.length > 0) lines.push('')
              lines.push(`Specs (${String(specResults.length)} shown, limit ${String(limit)}):`)
              for (const { spec, snippet, startLine, endLine } of specResults) {
                lines.push(`  [${spec.workspace}] ${spec.specId}`)
                if (snippet) {
                  lines.push(`    snippet @ L${String(startLine)}-L${String(endLine)}:`)
                  lines.push('      >>>')
                  lines.push(normalizeSnippet(snippet, { margin: 6 }))
                  lines.push('      <<<')
                }
              }
            }

            if (documentResults.length > 0) {
              if (lines.length > 0) lines.push('')
              lines.push(
                `Documents (${String(documentResults.length)} shown, limit ${String(limit)}):`,
              )
              for (const { document, snippet, startLine, endLine } of documentResults) {
                lines.push(`  [${document.workspace}] ${document.configRelativePath}`)
                if (snippet) {
                  lines.push(`    snippet @ L${String(startLine)}-L${String(endLine)}:`)
                  lines.push('      >>>')
                  lines.push(normalizeSnippet(snippet, { margin: 6 }))
                  lines.push('      <<<')
                }
              }
            }

            if (lines.length === 0) {
              lines.push('No results found.')
            }

            output(lines.join('\n'), 'text')
          } else {
            output(
              {
                symbols: symbolResults.map(({ symbol, score, snippet, startLine, endLine }) => ({
                  workspace: symbol.filePath.includes(':')
                    ? symbol.filePath.substring(0, symbol.filePath.indexOf(':'))
                    : '',
                  symbol,
                  score,
                  snippet,
                  startLine,
                  endLine,
                })),
                specs: specResults.map(({ spec, score, snippet, startLine, endLine }) => ({
                  workspace: spec.workspace,
                  specId: spec.specId,
                  path: spec.path,
                  title: spec.title,
                  description: spec.description,
                  ...(opts.specContent ? { content: spec.content } : {}),
                  score,
                  snippet,
                  startLine,
                  endLine,
                })),
                documents: documentResults.map(
                  ({ document, score, snippet, startLine, endLine }) => ({
                    workspace: document.workspace,
                    path: document.path,
                    configRelativePath: document.configRelativePath,
                    score,
                    snippet,
                    startLine,
                    endLine,
                  }),
                ),
              },
              fmt,
            )
          }
        })
      },
    )
}
