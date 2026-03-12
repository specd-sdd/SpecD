import { type Command } from 'commander'
import chalk from 'chalk'
import boxen from 'boxen'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { handleError } from '../../handle-error.js'
import { output, parseFormat } from '../../formatter.js'

/** Width of each stat column box. */
const COL_WIDTH = 28

/**
 * Renders a titled inner box using box-drawing characters and chalk styling.
 *
 * @param title - The box header label.
 * @param lines - Content lines to display inside the box.
 * @param width - Total inner width of the box (including padding).
 * @returns The rendered box as a multi-line string.
 */
function innerBox(title: string, lines: string[], width: number): string {
  const pad = (s: string, w: number): string => s + ' '.repeat(Math.max(0, w - stripAnsi(s).length))
  const top = chalk.dim(`╭─ ${title} ${'─'.repeat(Math.max(0, width - title.length - 3))}╮`)
  const rows = lines.map((l) => chalk.dim('│') + ' ' + pad(l, width - 1) + chalk.dim('│'))
  const bot = chalk.dim('╰' + '─'.repeat(width) + '╯')
  return [top, ...rows, bot].join('\n')
}

/**
 * Strips ANSI escape codes from a string so that display widths can be
 * calculated correctly.
 *
 * @param s - The string to strip.
 * @returns The string with all ANSI codes removed.
 */
function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '')
}

/**
 * Merges two multi-line box strings side by side with a gap column between
 * them.
 *
 * @param left - The left-side box string.
 * @param right - The right-side box string.
 * @param gap - Number of spaces between the columns.
 * @returns The combined string with columns on the same rows.
 */
function sideBySide(left: string, right: string, gap = 2): string {
  const ls = left.split('\n')
  const rs = right.split('\n')
  const height = Math.max(ls.length, rs.length)
  const leftWidth = Math.max(...ls.map((l) => stripAnsi(l).length))
  const result: string[] = []
  for (let i = 0; i < height; i++) {
    const l = ls[i] ?? ''
    const r = rs[i] ?? ''
    const padding = ' '.repeat(Math.max(0, leftWidth - stripAnsi(l).length))
    result.push(l + padding + ' '.repeat(gap) + r)
  }
  return result.join('\n')
}

/**
 * Registers the `project overview` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerProjectOverview(parent: Command): void {
  parent
    .command('overview')
    .allowExcessArguments(false)
    .description('Show a visual dashboard of the project status')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (opts: { format: string; config?: string }) => {
      try {
        const fmt = parseFormat(opts.format)
        const { config, kernel } = await resolveCliContext({ configPath: opts.config })

        const [specs, activeChanges, drafts, discarded] = await Promise.all([
          kernel.specs.list.execute({ includeSummary: false }),
          kernel.changes.list.execute(),
          kernel.changes.listDrafts.execute(),
          kernel.changes.listDiscarded.execute(),
        ])

        if (fmt !== 'text') {
          const specsByWorkspace: Record<string, number> = {}
          for (const s of specs) {
            specsByWorkspace[s.workspace] = (specsByWorkspace[s.workspace] ?? 0) + 1
          }
          output(
            {
              projectRoot: config.projectRoot,
              schemaRef: config.schemaRef,
              workspaces: config.workspaces.map((w) => w.name),
              specs: { total: specs.length, byWorkspace: specsByWorkspace },
              changes: {
                active: activeChanges.length,
                drafts: drafts.length,
                discarded: discarded.length,
              },
            },
            fmt,
          )
          return
        }

        // ── Project box ──────────────────────────────────────────────────────
        const wsNames = config.workspaces.map((w) => w.name).join(', ')
        const projectLines = [
          `${chalk.dim('root:')}    ${chalk.white(config.projectRoot)}`,
          `${chalk.dim('schema:')}  ${chalk.cyan(config.schemaRef)}`,
          `${chalk.dim('workspaces:')} ${chalk.white(wsNames)}`,
        ]
        const projectSection = innerBox('Project', projectLines, 46)

        // ── Specs box ────────────────────────────────────────────────────────
        const specsByWorkspace: Record<string, number> = {}
        for (const s of specs) {
          specsByWorkspace[s.workspace] = (specsByWorkspace[s.workspace] ?? 0) + 1
        }
        const specLines = [
          `${chalk.bold.white(String(specs.length))} ${chalk.dim('total')}`,
          ...Object.entries(specsByWorkspace).map(
            ([ws, n]) => `  ${chalk.cyan(ws.padEnd(12))} ${chalk.white(String(n))}`,
          ),
        ]
        const specsSection = innerBox('Specs', specLines, COL_WIDTH)

        // ── Changes box ──────────────────────────────────────────────────────
        const byState: Record<string, number> = {}
        for (const c of activeChanges) {
          byState[c.state] = (byState[c.state] ?? 0) + 1
        }
        const stateLines = Object.entries(byState).map(
          ([s, n]) => `  ${chalk.yellow(s.padEnd(14))} ${chalk.white(String(n))}`,
        )
        const changeLines = [
          `${chalk.bold.white(String(activeChanges.length))} ${chalk.dim('active')}   ${chalk.dim('drafts:')} ${chalk.white(String(drafts.length))}`,
          ...stateLines,
          `${chalk.dim('discarded:')} ${chalk.white(String(discarded.length))}`,
        ]
        const changesSection = innerBox('Changes', changeLines, COL_WIDTH)

        // ── Assemble ─────────────────────────────────────────────────────────
        const bottomRow = sideBySide(specsSection, changesSection)
        const body = [projectSection, '', bottomRow].join('\n')

        const dashboard = boxen(body, {
          title: chalk.bold.white('SpecD') + chalk.dim(' project overview'),
          titleAlignment: 'center',
          padding: { top: 0, bottom: 0, left: 1, right: 1 },
          borderStyle: 'round',
          borderColor: 'cyan',
        })

        process.stdout.write(dashboard + '\n')
      } catch (err) {
        handleError(err, opts.format)
      }
    })
}
