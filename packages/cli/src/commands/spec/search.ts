import { type Command } from 'commander'
import { createCodeGraphProvider } from '@specd/sdk'
import { type SpecSearchEntry } from '@specd/sdk'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { cliError, handleError } from '../../handle-error.js'
import { colWidth, renderTable } from '../../helpers/table.js'

/**
 * Collects repeatable option values into an array.
 * @param value - The new option value.
 * @param previous - The accumulated array of previous values.
 * @returns A new array with the value appended.
 */
function collect(value: string, previous: string[]): string[] {
  return [...previous, value]
}

/**
 * Registers the `spec search` subcommand on the given parent command.
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerSpecSearch(parent: Command): void {
  parent
    .command('search <query>')
    .allowExcessArguments(false)
    .description(
      'Search spec content across workspaces. Uses the code graph index when available; falls back to filesystem search otherwise.',
    )
    .option('--workspace <name>', 'filter by workspace (repeatable)', collect, [])
    .option('--graph', 'require code graph index (error if unavailable)')
    .option('--summary', 'include a short description for each result')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .option('--limit <n>', 'max results', '20')
    .addHelpText(
      'after',
      `
The search command first attempts to use the code graph index for faster
full-text search. When the index is not available, it falls back to
filesystem-based search with a warning on stderr.

Use --graph to require the graph index and fail if it is unavailable.

JSON/TOON output schema:
{
  results: Array<{
    path: string
    title: string
    score: number
    summary?: string
  }>
}
`,
    )
    .action(
      async (
        query: string,
        opts: {
          workspace: string[]
          graph?: boolean
          summary?: boolean
          format: string
          config?: string
          limit: string
        },
      ) => {
        try {
          const { kernel, config } = await resolveCliContext({
            configPath: opts.config,
          })
          const fmt = parseFormat(opts.format)
          const limit = parseInt(opts.limit, 10)
          if (Number.isNaN(limit) || limit <= 0) {
            cliError('--limit must be a positive integer', opts.format)
          }
          const includeSummary = opts.summary === true
          const workspaceFilter = opts.workspace.length > 0 ? opts.workspace : undefined

          let entries: SpecSearchEntry[]

          const graphResult = await tryGraphSearch(config, query, limit, workspaceFilter)

          if (graphResult !== null) {
            entries = graphResult.map((r) => ({
              workspace: r.spec.workspace,
              path: r.spec.path,
              title: r.spec.title,
              score: r.score,
              matches: [],
              ...(includeSummary && r.spec.description ? { summary: r.spec.description } : {}),
            }))
          } else {
            if (opts.graph) {
              cliError(
                'code graph index not available; run "specd graph index" first',
                opts.format,
                1,
              )
            }
            process.stderr.write(
              'warning: code graph index not available, using filesystem search\n',
            )
            entries = await kernel.specs.search.execute(query, {
              ...(workspaceFilter !== undefined ? { workspaces: workspaceFilter } : {}),
              includeSummary,
              limit,
            })
          }

          renderResults(entries, fmt, includeSummary)
        } catch (err) {
          handleError(err, opts.format)
        }
      },
    )
}

/** Shape of a single graph spec search result. */
interface GraphSpecResult {
  spec: { workspace: string; path: string; title: string; description: string }
  score: number
}

/**
 * Attempts to search specs using the code graph provider.
 * Returns null if the graph is unavailable or empty.
 * @param config - The specd configuration.
 * @param query - The search query string.
 * @param limit - Maximum number of results.
 * @param workspaceFilter - Optional workspace names to filter by.
 * @returns Graph search results, or null if graph is unavailable.
 */
async function tryGraphSearch(
  config: object,
  query: string,
  limit: number,
  workspaceFilter?: string[],
): Promise<GraphSpecResult[] | null> {
  let provider: ReturnType<typeof createCodeGraphProvider> | null = null
  try {
    provider = createCodeGraphProvider(config as Parameters<typeof createCodeGraphProvider>[0])
    await provider.open()
    const stats = await provider.getStatistics()
    if (stats.specCount === 0) {
      return null
    }
    const searchOptions: {
      query: string
      limit: number
      workspace?: string
    } = { query, limit }
    if (workspaceFilter !== undefined && workspaceFilter.length === 1) {
      searchOptions.workspace = workspaceFilter[0]!
    }
    const results = await provider.searchSpecs(searchOptions)
    if (workspaceFilter !== undefined && workspaceFilter.length > 1) {
      const wsSet = new Set(workspaceFilter)
      return results.filter((r) => wsSet.has(r.spec.workspace))
    }
    return results
  } catch {
    return null
  } finally {
    if (provider !== null) {
      try {
        await provider.close()
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * Renders search results in text or JSON/toon format.
 * @param entries - The search result entries.
 * @param fmt - The output format.
 * @param includeSummary - Whether to include summary column.
 */
function renderResults(
  entries: SpecSearchEntry[],
  fmt: 'text' | 'json' | 'toon',
  includeSummary: boolean,
): void {
  if (fmt === 'text') {
    if (entries.length === 0) {
      output('no matching specs', 'text')
      return
    }

    const columns: Array<{ header: string; width: number; overflow?: 'wrap' }> = [
      {
        header: 'SCORE',
        width: colWidth(
          'SCORE',
          entries.map((e) => e.score.toFixed(1)),
        ),
      },
      {
        header: 'PATH',
        width: colWidth(
          'PATH',
          entries.map((e) => `${e.workspace}:${e.path}`),
        ),
      },
      {
        header: 'TITLE',
        width: colWidth(
          'TITLE',
          entries.map((e) => e.title),
        ),
      },
    ]
    if (includeSummary) {
      columns.push({
        header: 'SUMMARY',
        width: Math.min(
          60,
          colWidth(
            'SUMMARY',
            entries.map((e) => e.summary ?? ''),
          ),
        ),
        overflow: 'wrap',
      })
    }

    const rows = entries.map((e) => {
      const row = [e.score.toFixed(1), `${e.workspace}:${e.path}`, e.title]
      if (includeSummary) row.push(e.summary ?? '')
      return row
    })

    output(renderTable(null, columns, rows), 'text')
  } else {
    output(
      entries.map((e) => ({
        path: `${e.workspace}:${e.path}`,
        title: e.title,
        score: e.score,
        ...(includeSummary && e.summary !== undefined ? { summary: e.summary } : {}),
      })),
      fmt,
    )
  }
}
