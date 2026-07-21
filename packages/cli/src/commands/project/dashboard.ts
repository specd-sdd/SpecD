import path from 'node:path'
import { type Command } from 'commander'
import chalk from 'chalk'
import boxen from 'boxen'
import { openSpecdHost, buildProjectStatusSnapshot } from '@specd/sdk'
import { buildCliKernelOptions } from '../../helpers/cli-context.js'
import { handleError } from '../../handle-error.js'
import { output, parseFormat } from '../../formatter.js'
import { renderBanner } from '../../banner.js'
import { CLI_VERSION, CODE_GRAPH_VERSION, CORE_VERSION, SDK_VERSION } from '../../version.js'

/** Label for the root row, including trailing spaces to align the value column. */
const ROOT_LABEL = 'root:       '

/**
 * Wraps a text string (such as comma-separated values or file paths) into lines
 * where each line is at most `maxWidth` characters long, preferring to split
 * at spaces/commas instead of mid-word.
 *
 * @param text - The string to wrap.
 * @param maxWidth - Maximum character width per line.
 * @returns Array of line segments without leading/trailing indentation.
 */
function wrapText(text: string, maxWidth: number): string[] {
  if (text.length <= maxWidth) {
    return [text]
  }

  const words = text.split(' ')
  const lines: string[] = []
  let currentLine = ''

  for (const word of words) {
    if (currentLine.length === 0) {
      if (word.length > maxWidth) {
        let rem = word
        while (rem.length > maxWidth) {
          lines.push(rem.slice(0, maxWidth))
          rem = rem.slice(maxWidth)
        }
        currentLine = rem
      } else {
        currentLine = word
      }
    } else if (currentLine.length + 1 + word.length <= maxWidth) {
      currentLine += ' ' + word
    } else {
      lines.push(currentLine)
      if (word.length > maxWidth) {
        let rem = word
        while (rem.length > maxWidth) {
          lines.push(rem.slice(0, maxWidth))
          rem = rem.slice(maxWidth)
        }
        currentLine = rem
      } else {
        currentLine = word
      }
    }
  }

  if (currentLine.length > 0) {
    lines.push(currentLine)
  }

  return lines
}

/**
 * Renders a titled inner box using box-drawing characters and chalk styling.
 *
 * @param title - The box header label.
 * @param lines - Content lines to display inside the box.
 * @param width - Total width of the box (including borders).
 * @param minLines - Minimum number of content lines (pads with empty rows if needed).
 * @returns The rendered box as a multi-line string.
 */
function innerBox(title: string, lines: string[], width: number, minLines = 0): string {
  const innerWidth = width - 4
  const pad = (s: string, w: number): string => s + ' '.repeat(Math.max(0, w - stripAnsi(s).length))
  const paddedLines = [...lines]
  while (paddedLines.length < minLines) {
    paddedLines.push('')
  }
  const topBarLen = Math.max(0, width - title.length - 5)
  const top = chalk.dim(`╭─ ${title} ${'─'.repeat(topBarLen)}╮`)
  const rows = paddedLines.map(
    (l) => chalk.dim('│') + ' ' + pad(l, innerWidth) + ' ' + chalk.dim('│'),
  )
  const bot = chalk.dim('╰' + '─'.repeat(width - 2) + '╯')
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
  return s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
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
  const rightWidth = Math.max(...rs.map((r) => stripAnsi(r).length))
  const result: string[] = []
  for (let i = 0; i < height; i++) {
    const l = ls[i] ?? ''
    const r = rs[i] ?? ''
    const padL = ' '.repeat(Math.max(0, leftWidth - stripAnsi(l).length))
    const padR = ' '.repeat(Math.max(0, rightWidth - stripAnsi(r).length))
    result.push(l + padL + ' '.repeat(gap) + r + padR)
  }
  return result.join('\n')
}

/**
 * Registers the `project dashboard` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerProjectDashboard(parent: Command): void {
  parent
    .command('dashboard')
    .allowExcessArguments(false)
    .description(
      'Display a project-level dashboard showing schema, workspaces, spec counts, and change activity. Runs automatically when specd is invoked with no subcommand and a config is present.',
    )
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  Delegates directly to specd project status --format <fmt>
`,
    )
    .action(async (opts: { format: string; config?: string }) => {
      try {
        const fmt = parseFormat(opts.format)

        if (fmt !== 'text') {
          const host = await openSpecdHost({
            ...(opts.config !== undefined ? { configPath: opts.config } : {}),
            options: {
              kernel: buildCliKernelOptions(),
            },
          })
          const snapshot = await buildProjectStatusSnapshot(host, { includeGraph: true })
          const summary = snapshot.summary
          const graphHealth = snapshot.graphHealth
          const totalSpecs = Object.values(summary.specsByWorkspace).reduce((acc, c) => acc + c, 0)

          output(
            {
              projectRoot: host.config.projectRoot,
              schemaRef: host.config.schemaRef,
              workspaces: host.config.workspaces,
              specs: {
                total: totalSpecs,
                byWorkspace: summary.specsByWorkspace,
              },
              changes: {
                active: summary.activeCount,
                drafts: summary.draftCount,
                discarded: summary.discardedCount,
                archived: summary.archivedCount,
              },
              graph: graphHealth
                ? {
                    freshness: graphHealth.lastIndexedAt,
                    stale: graphHealth.stale,
                    fingerprintMismatch: graphHealth.fingerprintMismatch,
                  }
                : null,
              approvals: snapshot.approvals,
              llmOptimizedContext: snapshot.llmOptimizedContext,
            },
            fmt,
          )
          return
        }

        const host = await openSpecdHost({
          ...(opts.config !== undefined ? { configPath: opts.config } : {}),
          options: {
            kernel: buildCliKernelOptions(),
          },
        })
        const config = host.config
        const snapshot = await buildProjectStatusSnapshot(host, { includeGraph: true })
        const { summary, graphHealth } = snapshot

        // ── Banner ────────────────────────────────────────────────────────────
        process.stdout.write(
          renderBanner({
            cliVersion: CLI_VERSION,
            sdkVersion: SDK_VERSION,
            coreVersion: CORE_VERSION,
            codeGraphVersion: CODE_GRAPH_VERSION,
          }) + '\n\n',
        )

        // ── "Using config:" line ──────────────────────────────────────────────
        const displayPath = host.configFilePath ?? '<unknown config>'
        const relConfigPath = path.relative(process.cwd(), displayPath)
        process.stdout.write(`Using config: ${relConfigPath}\n\n`)

        // ── Layout dimensions ───────────────────────────────────────────────
        const wsEntries = Object.entries(summary.specsByWorkspace)
        const maxWsLen = Math.max(12, ...wsEntries.map(([ws]) => ws.length))

        // Total viewport width available from TTY (default 80 if undefined/piped)
        const termCols = process.stdout.columns ?? 80

        // Fit inner content to TTY width minus boxen decoration and terminal margins
        const minContentWidth = Math.max(30, maxWsLen + 8) * 2 + 2
        const PROJECT_BOX_WIDTH = Math.max(minContentWidth, termCols - 6)

        // Divide side-by-side row width into left (Specs) and right (Changes) columns with a 2-space gap
        const LEFT_COL_WIDTH = Math.floor((PROJECT_BOX_WIDTH - 2) / 2)
        const RIGHT_COL_WIDTH = PROJECT_BOX_WIDTH - 2 - LEFT_COL_WIDTH

        // ── Project box ──────────────────────────────────────────────────────
        const wsNames = config.workspaces.map((w) => w.name).join(', ')
        const wsLabel = 'workspaces: '
        const wsIndent = ' '.repeat(wsLabel.length)
        const rootIndent = ' '.repeat(ROOT_LABEL.length)
        const valueWidth = PROJECT_BOX_WIDTH - 4 - ROOT_LABEL.length
        const wsValueWidth = PROJECT_BOX_WIDTH - 4 - wsLabel.length

        const rootLines = wrapText(config.projectRoot, valueWidth)
        const rootFirstLine = `${chalk.dim('root:')}       ${chalk.white(rootLines[0] ?? '')}`
        const rootContinuations = rootLines.slice(1).map((line) => rootIndent + chalk.white(line))

        const wsLines = wrapText(wsNames, wsValueWidth)
        const wsFirstLine = `${chalk.dim('workspaces:')} ${chalk.white(wsLines[0] ?? '')}`
        const wsContinuations = wsLines.slice(1).map((line) => wsIndent + chalk.white(line))

        const projectLines = [
          rootFirstLine,
          ...rootContinuations,
          `${chalk.dim('schema:')}     ${chalk.cyan(config.schemaRef)}`,
          wsFirstLine,
          ...wsContinuations,
        ]
        const projectSection = innerBox('Project', projectLines, PROJECT_BOX_WIDTH)

        // ── Specs & Changes side-by-side box content ─────────────────────────
        const totalSpecs = Object.values(summary.specsByWorkspace).reduce((acc, c) => acc + c, 0)
        const countColWidth = LEFT_COL_WIDTH - 6 - maxWsLen
        const specLines = [
          `${chalk.bold.white(String(totalSpecs))} ${chalk.dim('total')}`,
          ...wsEntries.map(
            ([ws, n]) =>
              `  ${chalk.cyan(ws.padEnd(maxWsLen))}${chalk.white(String(n).padStart(countColWidth))}`,
          ),
        ]

        const changeStateLabels = [
          ['active', summary.activeCount],
          ['drafts', summary.draftCount],
          ['discarded', summary.discardedCount],
          ['archived', summary.archivedCount],
        ] as const
        const changeLabelWidth = 12
        const changeCountWidth = RIGHT_COL_WIDTH - 6 - changeLabelWidth
        const changeLines = changeStateLabels.map(
          ([label, count]) =>
            `  ${chalk.cyan(label.padEnd(changeLabelWidth))}${chalk.white(String(count).padStart(changeCountWidth))}`,
        )

        // Equalize content lines so bottom borders align on the exact same row
        const sideBySideMinLines = Math.max(specLines.length, changeLines.length)
        const specsSection = innerBox('Specs', specLines, LEFT_COL_WIDTH, sideBySideMinLines)
        const changesSection = innerBox('Changes', changeLines, RIGHT_COL_WIDTH, sideBySideMinLines)

        // ── Graph box ────────────────────────────────────────────────────────
        let graphSection = ''
        if (graphHealth !== null) {
          const freshness = graphHealth.lastIndexedAt
            ? `${graphHealth.lastIndexedAt.slice(0, 10)} (${graphHealth.stale ? 'stale' : 'fresh'})`
            : 'never indexed'
          const totalRelations = Object.values(graphHealth.relationCounts ?? {}).reduce(
            (a, b) => a + b,
            0,
          )
          const langs =
            graphHealth.languages && graphHealth.languages.length > 0
              ? graphHealth.languages.join(', ')
              : 'n/a'
          const graphLines = [
            `${chalk.dim('freshness:')} ${chalk.white(freshness)}`,
            `${chalk.dim('docs:')} ${chalk.white(String(graphHealth.documentCount).padEnd(6))} ${chalk.dim('files:')} ${chalk.white(String(graphHealth.fileCount).padEnd(6))} ${chalk.dim('symbols:')} ${chalk.white(String(graphHealth.symbolCount).padEnd(6))} ${chalk.dim('relations:')} ${chalk.white(String(totalRelations))}`,
            `${chalk.dim('languages:')} ${chalk.white(langs)}`,
          ]
          graphSection = innerBox('Graph', graphLines, PROJECT_BOX_WIDTH)
        }

        // ── Assemble ─────────────────────────────────────────────────────────
        const middleRow = sideBySide(specsSection, changesSection)
        const bodyLines = [projectSection, '', middleRow]
        if (graphSection !== '') {
          bodyLines.push('', graphSection)
        }
        const body = bodyLines.join('\n')

        const dashboard = boxen(body, {
          title: chalk.bold.white('SpecD') + chalk.dim(' project dashboard'),
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
