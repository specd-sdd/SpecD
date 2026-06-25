import {
  createCodeGraphProvider,
  parseFingerprintMap,
  detectFingerprintMismatch,
  type GraphStatistics,
  type HotspotResult,
  buildProjectGraphConfig,
} from '@specd/code-graph'
import { createVcsAdapter, type SpecdConfig } from '@specd/core'
import { type Command } from 'commander'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { handleError } from '../../handle-error.js'
import { output, parseFormat } from '../../formatter.js'
import { codeGraphVersion } from '../graph/code-graph-version.js'

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
    .option(
      '--context',
      'Include project context references (instructions, files, specs to read)',
      false,
    )
    .option('--graph', 'Include extended graph stats', false)
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (opts: ProjectStatusOptions) => {
      try {
        const fmt = parseFormat(opts.format)
        const { config, kernel } = await resolveCliContext({
          configPath: opts.config,
        })

        const [workspaces, activeChanges, drafts, discarded, graphData] = await Promise.all([
          kernel.project.listWorkspaces.execute(),
          kernel.changes.list.execute(),
          kernel.changes.listDrafts.execute(),
          kernel.changes.listDiscarded.execute(),
          loadGraphData(config, opts.graph ?? false),
        ])
        const graphStats = graphData.stats
        const hotspots = graphData.hotspots

        const specCounts = await Promise.all(
          workspaces.map(async (ws) => ({
            name: ws.name,
            count: await ws.specRepo.count(),
          })),
        )
        const totalSpecs = specCounts.reduce((acc, c) => acc + c.count, 0)

        const graphFreshness = graphStats?.lastIndexedAt ?? null
        let graphStale: boolean | null = null
        let fingerprintMismatch: boolean | null = null
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

          if (graphStats.graphFingerprint !== null) {
            try {
              const storedMap = parseFingerprintMap(graphStats.graphFingerprint)
              const graphConfig = buildProjectGraphConfig(config)

              fingerprintMismatch = detectFingerprintMismatch(
                storedMap,
                codeGraphVersion,
                config.projectRoot,
                workspaces,
                graphConfig,
              )
            } catch {
              fingerprintMismatch = null
            }
          }
        }

        const approvals = {
          specEnabled: config.approvals?.spec ?? false,
          signoffEnabled: config.approvals?.signoff ?? false,
        }
        const llmOptimizedContext = config.llmOptimizedContext ?? false

        let contextData:
          | {
              instructions: string[]
              files: string[]
              specs: string[]
              optimizedContext?: string
            }
          | undefined
        let fullContext: string[] | undefined
        if (opts.context) {
          const compileConfig = {
            projectRoot: config.projectRoot,
            configPath: config.configPath,
            llmOptimizedContext: config.llmOptimizedContext,
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

          // Emit warnings to stderr
          for (const w of ctxResult.warnings) {
            process.stderr.write(`warning: ${w.message}\n`)
          }

          fullContext = ctxResult.contextEntries

          const instructionEntries = (config.context ?? [])
            .filter((e): e is { instruction: string } => 'instruction' in e)
            .map((e) => e.instruction)

          const fileEntries = (config.context ?? [])
            .filter((e): e is { file: string } => 'file' in e)
            .map((e) => e.file)

          let specsList: string[] = []
          let optimizedContext: string | undefined

          const isFresh =
            config.llmOptimizedContext &&
            !ctxResult.warnings.some((w) => w.type === 'stale-optimization')
          if (isFresh) {
            optimizedContext = ctxResult.contextEntries[0]
            const rawResult = await kernel.project.getProjectContext.execute({
              config: { ...compileConfig, llmOptimizedContext: false },
            })
            specsList = rawResult.specs.map((s) => s.specId)
          } else {
            specsList = ctxResult.specs.map((s) => s.specId)
          }

          contextData = {
            instructions: instructionEntries,
            files: fileEntries,
            specs: specsList,
            ...(optimizedContext !== undefined ? { optimizedContext } : {}),
          }
        }

        if (fmt !== 'text') {
          output(
            {
              projectRoot: config.projectRoot,
              schemaRef: config.schemaRef,
              workspaces: workspaces.map((w) => ({
                name: w.name,
                prefix: w.prefix,
                ownership: w.ownership,
                codeRoot: w.codeRoot,
                isExternal: w.isExternal,
              })),
              specs: {
                total: totalSpecs,
                byWorkspace: Object.fromEntries(specCounts.map((c) => [c.name, c.count])),
              },
              changes: {
                active: activeChanges.length,
                drafts: drafts.length,
                discarded: discarded.length,
              },
              graph: {
                freshness: graphFreshness,
                stale: graphStale,
                fingerprintMismatch,
                ...(opts.graph && graphStats
                  ? {
                      fileCount: graphStats.fileCount,
                      symbolCount: graphStats.symbolCount,
                      relationCounts: graphStats.relationCounts,
                      languages: graphStats.languages,
                      hotspots: hotspots
                        ? hotspots.entries.map((e) => ({
                            symbol: {
                              id: e.symbol.id,
                              name: e.symbol.name,
                              kind: e.symbol.kind,
                              filePath: e.symbol.filePath,
                            },
                            score: e.score,
                            riskLevel: e.riskLevel,
                          }))
                        : [],
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
          ...workspaces.map(
            (w) =>
              `  ${w.name} [prefix: ${w.prefix}, ${w.ownership}, ${
                w.isExternal ? 'external' : 'local'
              }, codeRoot: ${w.codeRoot}]`,
          ),
          `specs: ${String(totalSpecs)} total`,
          ...specCounts.map((c) => `  ${c.name}: ${String(c.count)}`),
          `changes: ${activeChanges.length} active, ${drafts.length} drafts, ${discarded.length} discarded`,
          `graph.freshness: ${graphFreshness ?? 'never indexed'} (${graphStale ? 'stale' : 'fresh'})`,
          ...(fingerprintMismatch === true
            ? ['graph.derivation: ⚠ fingerprint mismatch — reindex recommended']
            : []),
          ...(opts.graph && graphStats
            ? [
                `graph.files: ${graphStats.fileCount}`,
                `graph.symbols: ${graphStats.symbolCount}`,
                `graph.languages: ${graphStats.languages.join(', ') || 'none'}`,
                ...(hotspots && hotspots.entries.length > 0
                  ? [
                      `graph.hotspots:`,
                      ...hotspots.entries
                        .slice(0, 5)
                        .map(
                          (e) =>
                            `  - [${e.symbol.kind}] ${e.symbol.name} (${e.symbol.filePath}) - score: ${e.score}, risk: ${e.riskLevel}`,
                        ),
                    ]
                  : []),
              ]
            : []),
          `approvals.spec: ${approvals.specEnabled ? 'on' : 'off'}`,
          `approvals.signoff: ${approvals.signoffEnabled ? 'on' : 'off'}`,
          `llmOptimizedContext: ${llmOptimizedContext ? 'on' : 'off'}`,
          ...(opts.context && fullContext !== undefined
            ? [
                `context:`,
                ...fullContext.map((c) =>
                  c
                    .split('\n')
                    .map((l) => `  ${l}`)
                    .join('\n'),
                ),
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
 * Loads code graph statistics and optionally hotspots.
 *
 * @param config - Resolved project configuration.
 * @param includeHotspots - Whether to load hotspot entries.
 * @returns Graph statistics and hotspots, or nulls when unavailable.
 */
async function loadGraphData(
  config: SpecdConfig,
  includeHotspots: boolean,
): Promise<{ stats: GraphStatistics | null; hotspots: HotspotResult | null }> {
  try {
    const provider = createCodeGraphProvider(config)
    await provider.open()
    try {
      const stats = await provider.getStatistics()
      let hotspots: HotspotResult | null = null
      if (includeHotspots) {
        try {
          hotspots = await provider.getHotspots()
        } catch {
          // ignore
        }
      }
      return { stats, hotspots }
    } finally {
      await provider.close()
    }
  } catch {
    return { stats: null, hotspots: null }
  }
}
