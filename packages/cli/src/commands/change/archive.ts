import { type Command } from 'commander'
import * as path from 'node:path'
import {
  type ArchiveHookPhaseSelector,
  type CheckProgressEvent,
  SpecOverlapError,
} from '@specd/sdk'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat, serializeOutput, type OutputFormat } from '../../formatter.js'
import { handleError, cliError } from '../../handle-error.js'
import { parseCommaSeparatedValues } from '../../helpers/parse-comma-values.js'
import { createCheckProgressPresenter } from './_check-progress-presenter.js'

const VALID_ARCHIVE_HOOK_PHASES = new Set<ArchiveHookPhaseSelector>(['pre', 'post', 'all'])

/**
 * Writes one structured stream record for machine-readable archive output.
 *
 * @param format - Structured output format
 * @param record - Stream record payload
 */
function writeStructuredRecord(format: Exclude<OutputFormat, 'text'>, record: unknown): void {
  process.stdout.write(`${serializeOutput(record, format)}\n`)
}

/**
 * Builds an archive progress callback for the generic check bus.
 *
 * @param format - CLI output format
 * @returns Progress sink
 */
function makeArchiveProgressRenderer(format: OutputFormat): {
  onProgress: (event: CheckProgressEvent) => void
} {
  const checkPresenter = createCheckProgressPresenter({
    format,
    streamName: 'change-archive',
    stream: format === 'text' ? process.stderr : process.stdout,
  })
  return {
    onProgress: (event) => {
      checkPresenter.onEvent(event)
    },
  }
}

/**
 * Registers the `change archive` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerChangeArchive(parent: Command): void {
  parent
    .command('archive <name>')
    .allowExcessArguments(false)
    .description(
      'Move an archivable change to the archive (or retry from archiving after a failed commit).',
    )
    .option('--skip-hooks <phases>', 'skip archive hook phases (pre,post,all)')
    .option('--allow-overlap', 'permit archiving despite spec overlap with other active changes')
    .option(
      '--allow-out-of-scope',
      'permit archiving when implementation links resolve outside the change scope (impl.linksInScope)',
    )
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  Stream records on stdout:
    { stream: "change-archive", event: { type: "check-start"|"check-progress"|"check-done" } }
  Terminal record:
    { stream: "change-archive", event: { type: "complete", result: { result: "ok", name: string, archivePath: string, invalidatedChanges: unknown[] } } }
`,
    )
    .action(
      async (
        name: string,
        opts: {
          format: string
          config?: string
          skipHooks?: string
          allowOverlap?: true
          allowOutOfScope?: true
        },
      ) => {
        try {
          const skipHookPhases =
            opts.skipHooks !== undefined
              ? parseCommaSeparatedValues(opts.skipHooks, VALID_ARCHIVE_HOOK_PHASES, '--skip-hooks')
              : new Set<ArchiveHookPhaseSelector>()

          const { config, kernel } = await resolveCliContext({ configPath: opts.config })
          const fmt = parseFormat(opts.format)
          const progressRenderer = makeArchiveProgressRenderer(fmt)

          const result = await kernel.changes.archive.execute(
            {
              name,
              skipHookPhases,
              ...(opts.allowOverlap === true ? { allowOverlap: true } : {}),
              ...(opts.allowOutOfScope === true ? { allowOutOfScope: true } : {}),
            },
            progressRenderer.onProgress,
          )

          const archivePath = path.relative(config.projectRoot, result.archiveDirPath)

          if (result.postHookFailures.length > 0) {
            const cmds = result.postHookFailures.join(', ')
            cliError(`post-archive hook(s) failed: ${cmds}`, opts.format, 2)
          }

          if (fmt === 'text') {
            output(`archived change ${name} → ${archivePath}`, 'text')
            if (result.invalidatedChanges.length > 0) {
              const lines = [`invalidated ${result.invalidatedChanges.length} overlapping changes:`]
              for (const ic of result.invalidatedChanges) {
                lines.push(`  - ${ic.name} (specs: ${ic.specIds.join(', ')})`)
              }
              output(lines.join('\n'), 'text')
            }
          } else {
            writeStructuredRecord(fmt, {
              stream: 'change-archive',
              event: {
                type: 'complete',
                result: {
                  result: 'ok',
                  name,
                  archivePath,
                  invalidatedChanges: result.invalidatedChanges,
                },
              },
            })
          }
        } catch (err) {
          if (err instanceof SpecOverlapError) {
            const specList = err.entries
              .map(
                (e) =>
                  `  ${e.specId} — also targeted by: ${e.changes
                    .filter((c) => c.name !== name)
                    .map((c) => `${c.name} (${c.state})`)
                    .join(', ')}`,
              )
              .join('\n')
            process.stderr.write(
              `error: cannot archive — spec overlap detected:\n${specList}\n\n` +
                'Use --allow-overlap to proceed despite overlap.\n',
            )
            process.exit(1)
          }
          handleError(err, opts.format)
        }
      },
    )
}
