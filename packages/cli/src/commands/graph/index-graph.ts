import { Command } from 'commander'
import { type IndexOptions } from '@specd/code-graph'
import { rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { output, parseFormat } from '../../formatter.js'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { withProvider } from './with-provider.js'
import { buildWorkspaceTargets } from './build-workspace-targets.js'

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
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
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
    .action(async (opts: { workspace?: string; force?: boolean; format: string }) => {
      const fmt = parseFormat(opts.format)
      const isTTY = process.stderr.isTTY === true && fmt === 'text'

      const { config, kernel } = await resolveCliContext()

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
          const width = 20
          const filled = Math.round((percent / 100) * width)
          const bar = '█'.repeat(filled) + '░'.repeat(width - filled)
          process.stderr.write(`\r\x1b[K  ${bar} ${String(percent).padStart(3)}% ${phase}`)
        }

        const workspaces = await buildWorkspaceTargets(config, kernel, opts.workspace)

        if (workspaces.length === 0) {
          output(
            opts.workspace
              ? `No workspace found matching "${opts.workspace}".`
              : 'No workspaces configured.',
            'text',
          )
          return
        }

        const indexOpts: IndexOptions = {
          workspaces,
          projectRoot: config.projectRoot,
          ...(isTTY ? { onProgress: progressFn } : {}),
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
    })
}
