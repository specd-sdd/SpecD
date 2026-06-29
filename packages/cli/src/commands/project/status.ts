import { buildProjectStatusSnapshot, openSpecdHost } from '@specd/sdk'
import { type Command } from 'commander'
import { buildCliKernelOptions } from '../../helpers/cli-context.js'
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
    .option(
      '--context',
      'Include project context references (instructions, files, specs to read)',
      false,
    )
    .option('--graph', 'Include extended graph stats', false)
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  {
    projectRoot: string
    schema: string
    workspaces: Array<{ name, prefix, ownership, isExternal, codeRoot }>
    specs: { total: number, byWorkspace: Record<string, number> }
    changes: { active, drafts, discarded, archived }
    graph: { freshness, stale, fingerprintMismatch, files?, symbols?, languages?, hotspots? }
    approvals: { spec, signoff }
    llmOptimizedContext: boolean
    context?: { instructions, files, specs, optimizedContext? }
  }
`,
    )
    .action(async (opts: ProjectStatusOptions) => {
      try {
        const fmt = parseFormat(opts.format)
        const host = await openSpecdHost({
          ...(opts.config !== undefined ? { configPath: opts.config } : {}),
          kernelOptions: buildCliKernelOptions(),
        })
        const { config, kernel } = {
          config: host.config,
          kernel: host.kernel,
        }

        const workspaces = await kernel.project.listWorkspaces.execute()
        const snapshot = await buildProjectStatusSnapshot(host, {
          includeGraph: true,
          includeHotspots: opts.graph ?? false,
        })
        const summary = snapshot.summary
        const graphHealth = snapshot.graphHealth
        const hotspots = snapshot.hotspots

        const specCounts = Object.entries(summary.specsByWorkspace).map(([name, count]) => ({
          name,
          count,
        }))
        const totalSpecs = Object.values(summary.specsByWorkspace).reduce((acc, c) => acc + c, 0)

        const graphFreshness = graphHealth?.lastIndexedAt ?? null
        const graphStale = graphHealth?.stale ?? null
        const fingerprintMismatch = graphHealth?.fingerprintMismatch ?? null

        const approvals = snapshot.approvals
        const llmOptimizedContext = snapshot.llmOptimizedContext

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
          const ctxResult = await kernel.project.getProjectContext.execute({})

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
              llmOptimizedContext: false,
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
                active: summary.activeCount,
                drafts: summary.draftCount,
                discarded: summary.discardedCount,
                archived: summary.archivedCount,
              },
              graph: {
                freshness: graphFreshness,
                stale: graphStale,
                fingerprintMismatch,
                ...(opts.graph && graphHealth
                  ? {
                      fileCount: graphHealth.fileCount,
                      symbolCount: graphHealth.symbolCount,
                      relationCounts: graphHealth.relationCounts,
                      languages: graphHealth.languages,
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
          `changes: ${summary.activeCount} active, ${summary.draftCount} drafts, ${summary.discardedCount} discarded, ${summary.archivedCount} archived`,
          `graph.freshness: ${graphFreshness ?? 'never indexed'} (${graphStale === true ? 'stale' : graphStale === false ? 'fresh' : 'unknown'})`,
          ...(fingerprintMismatch === true
            ? ['graph.derivation: ⚠ fingerprint mismatch — reindex recommended']
            : []),
          ...(opts.graph && graphHealth
            ? [
                `graph.files: ${graphHealth.fileCount}`,
                `graph.symbols: ${graphHealth.symbolCount}`,
                `graph.languages: ${graphHealth.languages.join(', ') || 'none'}`,
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
