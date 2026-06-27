import { Command } from 'commander'
import { assertGraphIndexUnlocked, createGetGraphHealth } from '@specd/code-graph'
import { output, parseFormat } from '../../formatter.js'
import { cliError } from '../../handle-error.js'
import { resolveGraphCliContext } from './resolve-graph-cli-context.js'
import { withProvider } from './with-provider.js'
import { codeGraphVersion } from './code-graph-version.js'

/**
 * Registers the `graph stats` command.
 * @param parent - The parent commander command.
 */
export function registerGraphStats(parent: Command): void {
  parent
    .command('stats')
    .allowExcessArguments(false)
    .description('Show code graph statistics')
    .option('--config <path>', 'path to specd.yaml')
    .option('--path <path>', 'repository root for bootstrap mode')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  {
    fileCount: number
    documentCount: number
    symbolCount: number
    specCount: number
    relationCounts: Record<RelationType, number>
    languages: string[]
    lastIndexedAt?: string
    lastIndexedRef?: string | null
    stale: boolean | null
    currentRef: string | null
  }
`,
    )
    .action(async (opts: { config?: string; path?: string; format: string }) => {
      const fmt = parseFormat(opts.format)
      if (opts.config !== undefined && opts.path !== undefined) {
        cliError('--config and --path are mutually exclusive', opts.format, 1)
      }
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

      const getGraphHealth = createGetGraphHealth()

      try {
        assertGraphIndexUnlocked(config)
      } catch (err: unknown) {
        cliError(err instanceof Error ? err.message : 'The code graph is locked', opts.format, 3)
        return
      }

      try {
        await withProvider(config, opts.format, async (provider) => {
          const workspaces =
            kernel !== null
              ? (await kernel.project.listWorkspaces.execute()).map((ws) => ({
                  name: ws.name,
                  prefix: ws.prefix,
                  codeRoot: ws.codeRoot,
                  specRepo: ws.specRepo,
                  ownership: ws.ownership,
                  isExternal: ws.isExternal,
                }))
              : undefined

          const health = await getGraphHealth.execute({
            config,
            provider,
            codeGraphVersion,
            assertUnlocked: false,
            ...(workspaces !== undefined ? { workspaces } : {}),
          })

          const { stale, currentRef, fingerprintMismatch, ...stats } = health

          if (fmt === 'text') {
            const lines = [
              `Files:     ${String(stats.fileCount)}`,
              `Documents: ${String(stats.documentCount)}`,
              `Symbols:   ${String(stats.symbolCount)}`,
              `Specs:     ${String(stats.specCount)}`,
              `Languages: ${stats.languages.join(', ') || 'none'}`,
            ]

            const relEntries = Object.entries(stats.relationCounts).filter(([, count]) => count > 0)
            if (relEntries.length > 0) {
              lines.push('Relations:')
              for (const [type, count] of relEntries) {
                lines.push(`  ${type}: ${String(count)}`)
              }
            }

            if (stats.lastIndexedAt) {
              lines.push(`Last indexed: ${stats.lastIndexedAt}`)
            }

            if (stale === true && stats.lastIndexedRef !== null && currentRef !== null) {
              lines.push(
                `⚠ Graph is stale (indexed at ${stats.lastIndexedRef.slice(0, 7)}, current: ${currentRef.slice(0, 7)})`,
              )
            }

            if (fingerprintMismatch === true) {
              process.stderr.write(
                '⚠ Derivation fingerprint mismatch — code-graph version or workspace configuration changed since last index\n',
              )
            }

            output(lines.join('\n'), 'text')
          } else {
            output({ ...stats, stale, currentRef, fingerprintMismatch }, fmt)
          }
        })
      } catch (err: unknown) {
        cliError(
          err instanceof Error ? err.message : 'failed to read graph statistics',
          opts.format,
          3,
        )
      }
    })
}
