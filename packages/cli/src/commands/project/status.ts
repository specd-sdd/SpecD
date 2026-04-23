import path from 'node:path'
import { createCodeGraphProvider, type GraphStatistics } from '@specd/code-graph'
import { createVcsAdapter, type SpecdConfig } from '@specd/core'
import { type Command } from 'commander'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { handleError } from '../../handle-error.js'
import { output, parseFormat } from '../../formatter.js'

/** Parsed options accepted by the `project status` command. */
interface ProjectStatusOptions {
  context?: boolean
  graph?: boolean
  format: string
  config?: string
}

/**
 * Registers the `project status` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerProjectStatus(parent: Command): void {
  parent
    .command('status')
    .allowExcessArguments(false)
    .description(
      'Display consolidated project status: workspaces, specs, changes, graph, and optionally context references.',
    )
    .option('--context', 'Include project context references (instructions, files, specs to read)', false)
    .option('--graph', 'Include extended graph stats', false)
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (opts: ProjectStatusOptions) => {
      try {
        const fmt = parseFormat(opts.format)
        const { config, kernel } = await resolveCliContext({
          configPath: opts.config,
        })

        const [specs, activeChanges, drafts, discarded, graphStats] = await Promise.all([
          kernel.specs.list.execute({ includeSummary: false }),
          kernel.changes.list.execute(),
          kernel.changes.listDrafts.execute(),
          kernel.changes.listDiscarded.execute(),
          loadGraphStats(config),
        ])

        const specsByWorkspace: Record<string, number> = {}
        for (const s of specs) {
          specsByWorkspace[s.workspace] = (specsByWorkspace[s.workspace] ?? 0) + 1
        }

        const graphFreshness = graphStats?.lastIndexedAt ?? null
        let graphStale: boolean | null = null
        if (graphStats !== null) {
          let currentRef: string | null = null
          try {
            const vcs = await createVcsAdapter(config.projectRoot)
            currentRef = await vcs.ref()
          } catch {
            // No VCS
          }
          if (graphStats.lastIndexedRef !== null && currentRef !== null) {
            graphStale = graphStats.lastIndexedRef !== currentRef
          } else if (graphFreshness !== null) {
            graphStale = Date.now() - new Date(graphFreshness).getTime() > 24 * 60 * 60 * 1000
          }
        }

        const approvals = {
          specEnabled: config.approvals?.spec ?? false,
          signoffEnabled: config.approvals?.signoff ?? false,
        }
        const llmOptimizedContext = config.llmOptimizedContext ?? false

        let contextData:
          | Array<{ instruction: string; files: string[]; specs: string[] }>
          | undefined
        if (opts.context) {
          const compileConfig = {
            ...(config.context !== undefined
              ? {
                  context: config.context.map((e) =>
                    'file' in e ? { file: e.file } : { instruction: e.instruction },
                  ),
                }
              : {}),
            ...(config.contextIncludeSpecs !== undefined
              ? { contextIncludeSpecs: [...config.contextIncludeSpecs] }
              : {}),
            ...(config.contextExcludeSpecs !== undefined
              ? { contextExcludeSpecs: [...config.contextExcludeSpecs] }
              : {}),
          }

          const ctxResult = await kernel.project.getProjectContext.execute({
            config: compileConfig,
          })

          const firstContextEntry = config.context?.[0]
          const instruction =
            firstContextEntry !== undefined && 'instruction' in firstContextEntry
              ? firstContextEntry.instruction
              : ''
          const files: string[] = [
            path.join(config.projectRoot, '.specd', 'config'),
            path.join(config.projectRoot, '.specd', 'metadata'),
          ]
          contextData = [
            {
              instruction,
              files,
              specs: ctxResult.specs.map((s) => s.specId),
            },
          ]
        }

        if (fmt !== 'text') {
          const workspaceData = config.workspaces.map((w) => ({
            name: w.name,
            prefix: w.prefix ?? null,
            ownership: w.ownership,
            codeRoot: w.codeRoot,
          }))

          output(
            {
              projectRoot: config.projectRoot,
              schemaRef: config.schemaRef,
              workspaces: workspaceData,
              specs: { total: specs.length, byWorkspace: specsByWorkspace },
              changes: {
                active: activeChanges.length,
                drafts: drafts.length,
                discarded: discarded.length,
              },
              graph: {
                freshness: graphFreshness,
                stale: graphStale,
                ...(opts.graph && graphStats
                  ? {
                      fileCount: graphStats.fileCount,
                      symbolCount: graphStats.symbolCount,
                      relationCounts: graphStats.relationCounts,
                      languages: graphStats.languages,
                    }
                  : {}),
              },
              approvals,
              llmOptimizedContext,
              ...(contextData !== undefined ? { context: contextData } : {}),
            },
            fmt,
          )
          return
        }

        const lines = [
          `projectRoot: ${config.projectRoot}`,
          `schema: ${config.schemaRef}`,
          `workspaces:`,
          ...config.workspaces.map((w) => `  ${w.name} (prefix: ${w.prefix ?? '-'}) [${w.ownership}]`),
          `specs: ${specs.length} total`,
          ...Object.entries(specsByWorkspace).map(([ws, n]) => `  ${ws}: ${n}`),
          `changes: ${activeChanges.length} active, ${drafts.length} drafts, ${discarded.length} discarded`,
          `graph.freshness: ${graphFreshness ?? 'never indexed'} (${graphStale ? 'stale' : 'fresh'})`,
          ...(opts.graph && graphStats
            ? [
                `graph.files: ${graphStats.fileCount}`,
                `graph.symbols: ${graphStats.symbolCount}`,
                `graph.languages: ${graphStats.languages.join(', ') || 'none'}`,
              ]
            : []),
          `approvals.spec: ${approvals.specEnabled ? 'on' : 'off'}`,
          `approvals.signoff: ${approvals.signoffEnabled ? 'on' : 'off'}`,
          `llmOptimizedContext: ${llmOptimizedContext ? 'on' : 'off'}`,
          ...(opts.context && contextData
            ? [
                `context.instruction: ${contextData[0].instruction.slice(0, 80)}...`,
                `context.specs: ${contextData[0].specs.join(', ')}`,
              ]
            : []),
        ]

        process.stdout.write(lines.join('\n') + '\n')
      } catch (err) {
        handleError(err, opts.format)
      }
    })
}

/**
 * Loads code graph statistics.
 *
 * @param config - Resolved project configuration used to create the graph provider.
 * @returns Graph statistics, or `null` when the graph is not available.
 */
async function loadGraphStats(
  config: SpecdConfig,
): Promise<GraphStatistics | null> {
  try {
    const provider = createCodeGraphProvider(config)
    await provider.open()
    try {
      return await provider.getStatistics()
    } finally {
      await provider.close()
    }
  } catch {
    return null
  }
}
