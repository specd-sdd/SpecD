import { type Command } from 'commander'
import * as path from 'node:path'
import {
  type ArchiveHookPhaseSelector,
  type CheckProgressEvent,
  CheckPredicateFailedError,
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
 * @param skipChecks - Check ids bypassed with `--skip-checks`, rendered as skipped by that flag
 * @returns Progress sink
 */
function makeArchiveProgressRenderer(
  format: OutputFormat,
  skipChecks: ReadonlySet<string>,
): {
  onProgress: (event: CheckProgressEvent) => void
} {
  const checkPresenter = createCheckProgressPresenter({
    format,
    streamName: 'change-archive',
    stream: format === 'text' ? process.stderr : process.stdout,
    skipChecks,
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
    .option(
      '--skip-checks <ids>',
      'comma-separated check identifiers to bypass, repeatable (e.g. spec.overlap,impl.linksInScope)',
      (value: string, previous: string[]) => [...previous, value],
      [] as string[],
    )
    .option('--allow-overlap', 'alias of --skip-checks spec.overlap')
    .option('--allow-out-of-scope', 'alias of --skip-checks impl.linksInScope')
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
          skipChecks?: string[]
          allowOverlap?: true
          allowOutOfScope?: true
        },
      ) => {
        try {
          const skipHookPhases =
            opts.skipHooks !== undefined
              ? parseCommaSeparatedValues(opts.skipHooks, VALID_ARCHIVE_HOOK_PHASES, '--skip-hooks')
              : new Set<ArchiveHookPhaseSelector>()

          // The use case accepts only `skipChecks`; the aliases are translated here.
          const skipChecks = new Set<string>()
          for (const entry of opts.skipChecks ?? []) {
            for (const id of entry
              .split(',')
              .map((candidate) => candidate.trim())
              .filter(Boolean)) {
              skipChecks.add(id)
            }
          }
          if (opts.allowOutOfScope === true) {
            skipChecks.add('impl.linksInScope')
          }
          if (opts.allowOverlap === true) {
            skipChecks.add('spec.overlap')
          }

          const { config, kernel } = await resolveCliContext({ configPath: opts.config })
          const fmt = parseFormat(opts.format)
          const progressRenderer = makeArchiveProgressRenderer(fmt, skipChecks)

          const result = await kernel.changes.archive.execute(
            {
              name,
              skipHookPhases,
              ...(skipChecks.size > 0 ? { skipChecks: [...skipChecks] } : {}),
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
          if (err instanceof SpecOverlapError && opts.format === 'text') {
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
              `error: cannot archive — spec overlap detected:\n${specList}\n` +
                (err.skippable
                  ? '\nUse --skip-checks spec.overlap to proceed despite overlap.\n'
                  : ''),
            )
            process.exit(1)
          }
          if (err instanceof CheckPredicateFailedError && opts.format === 'text') {
            const lines = [
              `error: ${err.message}`,
              `  check:   ${err.label} (${err.checkId})`,
              ...(err.command ? [`  command: ${err.command}`] : []),
              ...(err.skippable === true
                ? [`  bypass:  Retry with --skip-checks ${err.checkId} if an exception is granted`]
                : []),
            ]
            process.stderr.write(`${lines.join('\n')}\n`)
            process.exit(1)
          }
          handleError(err, opts.format)
        }
      },
    )
}
