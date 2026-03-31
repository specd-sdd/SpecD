import { Command } from 'commander'
import { type IndexOptions, DEFAULT_EXCLUDE_PATHS } from '@specd/code-graph'
import { rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createVcsAdapter } from '@specd/core'
import { output, parseFormat } from '../../formatter.js'
import { cliError } from '../../handle-error.js'
import { resolveGraphCliContext } from './resolve-graph-cli-context.js'
import { withProvider } from './with-provider.js'
import { buildWorkspaceTargets } from './build-workspace-targets.js'
import { type WorkspaceIndexTarget } from '@specd/code-graph'

/**
 * Registers the `graph index` command.
 * @param parent - The parent commander command.
 */
export function registerGraphIndex(parent: Command): void {
  parent
    .command('index')
    .allowExcessArguments(false)
    .description('Index the workspace into the code graph')
    .option('--workspace <name>', 'index only the named workspace')
    .option('--force', 'full re-index, ignoring cached hashes')
    .option('--config <path>', 'path to specd.yaml')
    .option('--path <path>', 'repository root for bootstrap mode')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option(
      '--exclude-path <pattern>',
      'gitignore-syntax pattern to exclude (repeatable; merges with config)',
      (val: string, prev: string[]) => [...prev, val],
      [] as string[],
    )
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  {
    filesDiscovered: number
    filesIndexed: number
    filesRemoved: number
    filesSkipped: number
    specsDiscovered: number
    specsIndexed: number
    errors: Array<{ filePath: string, message: string }>
    duration: number
    workspaces: Array<{ name, filesDiscovered, filesIndexed, filesSkipped,
      filesRemoved, specsDiscovered, specsIndexed }>
  }
`,
    )
    .action(
      async (opts: {
        workspace?: string
        force?: boolean
        config?: string
        path?: string
        format: string
        excludePath: string[]
      }) => {
        const fmt = parseFormat(opts.format)
        const isTTY = process.stderr.isTTY === true && fmt === 'text'
        if (opts.config !== undefined && opts.path !== undefined) {
          cliError('--config and --path are mutually exclusive', opts.format, 1)
        }

        const context = await resolveGraphCliContext({
          configPath: opts.config,
          repoPath: opts.path,
        }).catch((err: unknown) =>
          cliError(
            err instanceof Error ? err.message : 'failed to resolve graph context',
            opts.format,
            1,
          ),
        )
        const { config } = context

        // --force: delete DB files before opening to clear stale locks and WAL
        if (opts.force) {
          const specdDir = join(config.projectRoot, '.specd')
          for (const name of ['code-graph.lbug', 'code-graph.lbug.wal', 'code-graph.lbug.lock']) {
            const p = join(specdDir, name)
            if (existsSync(p)) rmSync(p, { force: true })
          }
        }

        await withProvider(config, opts.format, async (provider) => {
          const progressFn = (percent: number, phase: string): void => {
            const clamped = Math.max(0, Math.min(100, percent))
            const width = 20
            const filled = Math.round((clamped / 100) * width)
            const bar = '█'.repeat(filled) + '░'.repeat(width - filled)
            process.stderr.write(`\r\x1b[K  ${bar} ${String(clamped).padStart(3)}% ${phase}`)
          }

          const rawWorkspaces: WorkspaceIndexTarget[] =
            context.mode === 'configured'
              ? await buildWorkspaceTargets(config, context.kernel!, opts.workspace)
              : buildBootstrapWorkspaceTargets(context.vcsRoot, opts.workspace)

          const workspaces =
            opts.excludePath.length > 0
              ? rawWorkspaces.map((ws) => ({
                  ...ws,
                  excludePaths: [
                    ...(ws.excludePaths ?? DEFAULT_EXCLUDE_PATHS),
                    ...opts.excludePath,
                  ],
                }))
              : rawWorkspaces

          if (workspaces.length === 0) {
            output(
              opts.workspace
                ? `No workspace found matching "${opts.workspace}".`
                : 'No workspaces configured.',
              'text',
            )
            return
          }

          let vcsRef: string | undefined
          try {
            const vcs = await createVcsAdapter(config.projectRoot)
            vcsRef = (await vcs.ref()) ?? undefined
          } catch {
            // No VCS or ref() failed — staleness detection unavailable
          }

          const indexOpts: IndexOptions = {
            workspaces,
            projectRoot: config.projectRoot,
            ...(isTTY ? { onProgress: progressFn } : {}),
            ...(vcsRef !== undefined ? { vcsRef } : {}),
          }

          const result = await provider.index(indexOpts)

          if (isTTY) {
            process.stderr.write('\r\x1b[K')
          }

          if (fmt === 'text') {
            const lines = [
              `Indexed ${String(result.filesIndexed)} file(s) in ${String(result.duration)}ms`,
              `  discovered: ${String(result.filesDiscovered)}`,
              `  skipped:    ${String(result.filesSkipped)}`,
              `  removed:    ${String(result.filesRemoved)}`,
              `  specs:      ${String(result.specsIndexed)}`,
            ]
            if (result.errors.length > 0) {
              lines.push(`  errors:     ${String(result.errors.length)}`)
              for (const err of result.errors) {
                lines.push(`    ${err.filePath}: ${err.message}`)
              }
            }
            if (result.workspaces.length > 1) {
              lines.push('  workspaces:')
              for (const ws of result.workspaces) {
                const specsPart =
                  ws.specsIndexed > 0 || ws.specsDiscovered > 0
                    ? `, ${String(ws.specsIndexed)}/${String(ws.specsDiscovered)} specs`
                    : ''
                lines.push(
                  `    ${ws.name}:    ${String(ws.filesDiscovered)} discovered, ${String(ws.filesIndexed)} indexed, ${String(ws.filesSkipped)} skipped, ${String(ws.filesRemoved)} removed${specsPart}`,
                )
              }
            }
            output(lines.join('\n'), 'text')
          } else {
            output(result, fmt)
          }
        })
      },
    )
}

/**
 * Builds the synthetic workspace targets used in graph bootstrap mode.
 *
 * @param vcsRoot - Resolved repository root.
 * @param workspaceFilter - Optional workspace filter from the CLI.
 * @returns Synthetic workspace targets for bootstrap indexing.
 */
function buildBootstrapWorkspaceTargets(
  vcsRoot: string,
  workspaceFilter?: string,
): WorkspaceIndexTarget[] {
  const target: WorkspaceIndexTarget = {
    name: 'default',
    codeRoot: vcsRoot,
    repoRoot: vcsRoot,
    specs: () => Promise.resolve([]),
  }

  return workspaceFilter !== undefined && workspaceFilter !== 'default' ? [] : [target]
}
