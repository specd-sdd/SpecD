import { Command, Option } from 'commander'
import { type SearchCategory, type SearchCodeGraphInput } from '@specd/sdk'
import { output, parseFormat } from '../../formatter.js'
import { cliError } from '../../handle-error.js'
import { parseGraphKinds } from './parse-graph-kinds.js'
import { resolveGraphCliContext } from './resolve-graph-cli-context.js'
import { withProvider } from './with-provider.js'
import { normalizeSnippet } from './normalize-snippet.js'
import { toGraphDisplayPath } from './resolve-impact-file-selectors.js'

import { warnGraphStale } from './warn-graph-staleness.js'

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
 * Formats the compact match location shown for spec and document results.
 *
 * @param startLine - First 1-based line included in the match range.
 * @param endLine - Last 1-based line included in the match range.
 * @returns Human-readable line-range metadata for text output.
 */
function renderMatchLocation(startLine: number, endLine: number): string {
  return `match @ L${String(startLine)}-L${String(endLine)}`
}

/**
 * Formats a half-open exact source range.
 * @param range - Exact 1-based-line/0-based-column range.
 * @param range.startLine - First 1-based line.
 * @param range.startColumn - First 0-based column.
 * @param range.endLine - Exclusive-end 1-based line.
 * @param range.endColumn - Exclusive-end 0-based column.
 * @returns Compact location text.
 */
function renderSourceRange(range: {
  readonly startLine: number
  readonly startColumn: number
  readonly endLine: number
  readonly endColumn: number
}): string {
  return `L${String(range.startLine)}:${String(range.startColumn)}-L${String(range.endLine)}:${String(range.endColumn)}`
}

/**
 * Appends a text-mode snippet block using the normalized CLI snippet format.
 *
 * @param lines - Mutable output line buffer.
 * @param snippet - Raw snippet text from the graph provider.
 * @param startLine - First 1-based line included in the snippet.
 * @param endLine - Last 1-based line included in the snippet.
 */
function renderSnippetBlock(
  lines: string[],
  snippet: string,
  startLine: number,
  endLine: number,
): void {
  lines.push(`    snippet @ L${String(startLine)}-L${String(endLine)}:`)
  lines.push('      >>>')
  lines.push(normalizeSnippet(snippet, { margin: 6 }))
  lines.push('      <<<')
}

/**
 * Registers the `graph search` command.
 * @param parent - The parent commander command.
 */
export function registerGraphSearch(parent: Command): void {
  parent
    .command('search <query>')
    .allowExcessArguments(false)
    .description('Search symbols, source files, specs, and documents')
    .option('--symbols', 'search only symbols')
    .option('--files', 'search only indexed source-file content')
    .option('--specs', 'search only specs')
    .option('--documents', 'search only documents')
    .option('--snippet', 'include snippet previews in text, json, and toon output')
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
      logicalTarget: LogicalSymbol | null
      declarations: LogicalDeclaration[]
      publicBindings: PublicBinding[]
      matchedPublicBindings: PublicBinding[]
      score: number
      matchTier: string
      matchReasons: string[]
      hits: Array<{ symbol: SymbolNode, score, startLine, endLine, snippet? }>
    }>
    files: Array<{
      workspace: string
      path: string
      configRelativePath: string
      score: number
      totalMatches: number
      omittedMatches: number
      matches: Array<{ range, matchedText, matchKind, sourceToken, snippet? }>
    }>
    specs: Array<{
      workspace: string
      specId: string
      path: string
      title: string
      description: string
      content?: string
      score: number
      startLine: number
      endLine: number
      snippet?: string
    }>
    documents: Array<{
      workspace: string
      path: string
      configRelativePath: string
      score: number
      startLine: number
      endLine: number
      snippet?: string
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
          files?: boolean
          specs?: boolean
          documents?: boolean
          snippet?: boolean
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
        const searchAll = !opts.symbols && !opts.files && !opts.specs && !opts.documents
        const kinds = (() => {
          try {
            return parseGraphKinds(opts.kind)
          } catch (err) {
            cliError(err instanceof Error ? err.message : 'invalid --kind value', opts.format, 1)
          }
        })()
        const { config, kernel } = await resolveGraphCliContext({
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
          await warnGraphStale(provider, config, kernel)
          const categories: SearchCategory[] = searchAll
            ? ['symbols', 'files', 'specs', 'documents']
            : [
                ...(opts.symbols ? (['symbols'] as const) : []),
                ...(opts.files ? (['files'] as const) : []),
                ...(opts.specs ? (['specs'] as const) : []),
                ...(opts.documents ? (['documents'] as const) : []),
              ]
          const searchInput: SearchCodeGraphInput = {
            query,
            categories,
            limit,
            includeSnippet: opts.snippet === true,
            ...(kinds !== undefined ? { kinds } : undefined),
            ...(opts.file ? { filePattern: opts.file } : undefined),
            ...(opts.workspace ? { workspace: opts.workspace } : undefined),
            ...(opts.excludePath.length > 0 ? { excludePaths: opts.excludePath } : undefined),
            ...(opts.excludeWorkspace.length > 0
              ? { excludeWorkspaces: opts.excludeWorkspace }
              : undefined),
          }

          const {
            symbols: symbolResults,
            files: fileResults,
            specs: specResults,
            documents: documentResults,
          } = await provider.search(searchInput)

          const toDisplayPath = (canonicalPath: string): Promise<string> =>
            toGraphDisplayPath(provider, canonicalPath)

          if (fmt === 'text') {
            const lines: string[] = []

            if (symbolResults.length > 0) {
              lines.push(`Symbols (${String(symbolResults.length)} shown, limit ${String(limit)}):`)
              for (const group of symbolResults) {
                const target = group.logicalTarget
                const firstHit = group.hits[0]
                if (target === null && firstHit !== undefined) {
                  const separator = firstHit.symbol.filePath.indexOf(':')
                  const workspace =
                    separator < 0 ? '' : firstHit.symbol.filePath.slice(0, separator)
                  lines.push(`  [${workspace}] ${firstHit.symbol.kind} ${firstHit.symbol.name}`)
                  lines.push(
                    `    ${await toDisplayPath(firstHit.symbol.filePath)}:${String(firstHit.symbol.line)}:${String(firstHit.symbol.column)}`,
                  )
                } else {
                  lines.push(
                    target === null
                      ? '  [legacy] (unknown)'
                      : `  [${target.workspace}] ${target.space} ${target.name}`,
                  )
                }
                if (target !== null) {
                  for (const binding of group.matchedPublicBindings) {
                    lines.push(
                      `    matched export: ${await toDisplayPath(binding.surface)}::${binding.exportedName}`,
                    )
                  }
                }
                lines.push(
                  `    match: ${group.matchTier} (${group.matchReasons.join(', ') || 'none'})`,
                )
                if (group.declarations.length > 0) {
                  for (const declaration of group.declarations) {
                    const location = declaration.declaration.location
                    lines.push(
                      `    declaration: ${await toDisplayPath(location.filePath)}:${String(location.line)}:${String(location.column)}`,
                    )
                  }
                } else {
                  for (const hit of group.hits) {
                    lines.push(
                      `    declaration: ${await toDisplayPath(hit.symbol.filePath)}:${String(hit.symbol.line)}:${String(hit.symbol.column)}`,
                    )
                  }
                }
                if (opts.snippet) {
                  for (const { snippet, startLine, endLine } of group.hits) {
                    if (snippet) renderSnippetBlock(lines, snippet, startLine, endLine)
                  }
                }
              }
            }

            if (fileResults.length > 0) {
              if (lines.length > 0) lines.push('')
              lines.push(`Files (${String(fileResults.length)} shown, limit ${String(limit)}):`)
              for (const { file, matches, omittedMatches } of fileResults) {
                lines.push(`  [${file.workspace}] ${file.configRelativePath}`)
                for (const match of matches) {
                  lines.push(
                    `    ${match.matchKind} ${renderSourceRange(match.range)} ${JSON.stringify(match.matchedText)} source=${match.sourceToken}`,
                  )
                  if (opts.snippet && match.snippet !== undefined) {
                    renderSnippetBlock(
                      lines,
                      match.snippet.content,
                      match.snippet.range.startLine,
                      match.snippet.range.endLine,
                    )
                  }
                }
                if (omittedMatches > 0) {
                  lines.push(`    ${String(omittedMatches)} more matches in this file`)
                }
              }
            }

            if (specResults.length > 0) {
              if (lines.length > 0) lines.push('')
              lines.push(`Specs (${String(specResults.length)} shown, limit ${String(limit)}):`)
              for (const { spec, snippet, startLine, endLine } of specResults) {
                lines.push(`  [${spec.workspace}] ${spec.specId}`)
                lines.push(`    ${renderMatchLocation(startLine, endLine)}`)
                if (opts.snippet && snippet) {
                  renderSnippetBlock(lines, snippet, startLine, endLine)
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
                lines.push(`    ${renderMatchLocation(startLine, endLine)}`)
                if (opts.snippet && snippet) {
                  renderSnippetBlock(lines, snippet, startLine, endLine)
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
                symbols: symbolResults.map((group) => ({
                  logicalTarget: group.logicalTarget,
                  declarations: group.declarations,
                  publicBindings: group.publicBindings,
                  matchedPublicBindings: group.matchedPublicBindings,
                  score: group.score,
                  matchTier: group.matchTier,
                  matchReasons: group.matchReasons,
                  hits: group.hits.map(({ symbol, score, snippet, startLine, endLine }) => ({
                    symbol,
                    score,
                    startLine,
                    endLine,
                    ...(opts.snippet ? { snippet } : {}),
                  })),
                })),
                files: fileResults.map(
                  ({ file, score, matches, totalMatches, omittedMatches }) => ({
                    workspace: file.workspace,
                    path: file.path,
                    configRelativePath: file.configRelativePath,
                    score,
                    totalMatches,
                    omittedMatches,
                    matches: matches.map((match) => ({
                      range: match.range,
                      matchedText: match.matchedText,
                      matchKind: match.matchKind,
                      sourceToken: match.sourceToken,
                      ...(opts.snippet ? { snippet: match.snippet } : {}),
                    })),
                  }),
                ),
                specs: specResults.map(({ spec, score, snippet, startLine, endLine }) => ({
                  workspace: spec.workspace,
                  specId: spec.specId,
                  path: spec.path,
                  title: spec.title,
                  description: spec.description,
                  ...(opts.specContent ? { content: spec.content } : {}),
                  score,
                  startLine,
                  endLine,
                  ...(opts.snippet ? { snippet } : {}),
                })),
                documents: documentResults.map(
                  ({ document, score, snippet, startLine, endLine }) => ({
                    workspace: document.workspace,
                    path: document.path,
                    configRelativePath: document.configRelativePath,
                    score,
                    startLine,
                    endLine,
                    ...(opts.snippet ? { snippet } : {}),
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
