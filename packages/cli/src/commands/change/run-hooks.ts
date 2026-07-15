import { type Command } from 'commander'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat, serializeOutput, type OutputFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'
import { createHookProgressPresenter } from './_hook-progress-presenter.js'

const TEXT_SUMMARY_TAIL_LINES = 10

/**
 * Renders the separator written to stderr after the hook stream completes.
 *
 * @param hooks - Executed hooks with final success state.
 * @returns One-line summary marker followed by a blank line.
 */
function renderAllHooksDoneMarker(hooks: ReadonlyArray<{ success: boolean }>): string {
  const doneCount = hooks.filter((hook) => hook.success).length
  const failedCount = hooks.length - doneCount
  return `[all hooks done] hooks=${hooks.length} done=${doneCount} failed=${failedCount} -------------------------------------\n\n`
}

/**
 * Normalizes captured hook output into printable non-empty lines.
 *
 * @param text - Raw stdout/stderr collected from a hook process.
 * @returns Sanitized lines ready for text summary rendering.
 */
function sanitizeHookOutput(text: string): string[] {
  return text
    .replaceAll(/\u001B\[[0-?]*[ -/]*[@-~]/g, '')
    .replaceAll(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
}

/**
 * Renders the final text summary emitted on stdout after all hooks finish.
 *
 * @param result - Aggregated hook execution result returned by the kernel.
 * @param result.success - Whether all hooks completed successfully.
 * @param result.hooks - Hooks executed for the requested lifecycle phase.
 * @returns Append-only text summary for human readers.
 */
function renderTextSummary(result: {
  success: boolean
  hooks: ReadonlyArray<{
    id: string
    command: string
    exitCode: number
    stdout: string
    stderr: string
    success: boolean
  }>
}): string {
  const completedHooks = result.hooks.filter((hook) => hook.success).length
  const failedHooks = result.hooks.length - completedHooks
  const lines = [
    'Hook summary',
    `result: ${result.success ? 'ok' : 'error'}`,
    `hooks: ${result.hooks.length}`,
    `done: ${completedHooks}`,
    `failed: ${failedHooks}`,
  ]
  for (const hook of result.hooks) {
    lines.push('')
    lines.push(`[${hook.success ? 'done' : 'failed'}] ${hook.id}`)
    lines.push(`command: ${hook.command}`)
    lines.push(`exit: ${hook.exitCode}`)
    const outputLines = sanitizeHookOutput(`${hook.stdout}${hook.stderr}`)
    const label = hook.success ? `last ${TEXT_SUMMARY_TAIL_LINES} lines` : 'full output'
    lines.push(`${label}:`)
    const renderedLines = hook.success ? outputLines.slice(-TEXT_SUMMARY_TAIL_LINES) : outputLines
    if (renderedLines.length === 0) {
      lines.push('  (no output)')
      continue
    }
    for (const line of renderedLines) {
      lines.push(`  ${line}`)
    }
  }
  return `${lines.join('\n')}\n`
}

/**
 * Writes one structured stream record for machine-readable hook output.
 *
 * @param format - Structured output format.
 * @param record - Stream record payload.
 */
function writeStructuredRecord(format: Exclude<OutputFormat, 'text'>, record: unknown): void {
  process.stdout.write(`${serializeOutput(record, format)}\n`)
}

/**
 * Registers the `change run-hooks` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerChangeRunHooks(parent: Command): void {
  parent
    .command('run-hooks <name> <step>')
    .allowExcessArguments(false)
    .description(
      'Execute run-hooks for a lifecycle phase of a change, optionally filtered with --only.',
    )
    .requiredOption('--phase <phase>', 'hook phase: pre or post')
    .option('--only <hook-id>', 'execute only the hook with this ID')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  Stream records on stdout:
    { stream: "hook-progress", event: ... }
    { stream: "run-hooks", event: { type: "complete", result: ... } }
`,
    )
    .action(
      async (
        name: string,
        step: string,
        opts: { phase: string; only?: string; format: string; config?: string },
      ) => {
        try {
          const fmt = parseFormat(opts.format)
          const { kernel } = await resolveCliContext({ configPath: opts.config })
          const presenter = createHookProgressPresenter({
            format: fmt,
            stream: fmt === 'text' ? process.stderr : process.stdout,
            autoFinalizeOnDone: true,
          })

          const result = await kernel.changes.runStepHooks.execute(
            {
              name,
              step,
              phase: opts.phase as 'pre' | 'post',
              only: opts.only,
            },
            (event) => {
              presenter.onEvent(event)
            },
          )

          if (result.hooks.length === 0) {
            if (fmt === 'text') {
              output('no hooks to run', 'text')
            } else {
              writeStructuredRecord(fmt, {
                stream: 'run-hooks',
                event: { type: 'complete', result: { result: 'ok', hooks: [] } },
              })
            }
            return
          }

          for (const hook of result.hooks) {
            presenter.finalizeHook({
              id: hook.id,
              command: hook.command,
              success: hook.success,
              exitCode: hook.exitCode,
              stdout: hook.stdout,
              stderr: hook.stderr,
            })
          }
          presenter.flush()
          if (fmt === 'text') {
            process.stderr.write(renderAllHooksDoneMarker(result.hooks))
          }

          if (fmt === 'text') {
            process.stdout.write(renderTextSummary(result))
          }

          if (!result.success) {
            if (fmt !== 'text') {
              const jsonHooks = result.hooks.map((h) =>
                h.success
                  ? { id: h.id, command: h.command, exitCode: h.exitCode, success: true }
                  : {
                      id: h.id,
                      command: h.command,
                      exitCode: h.exitCode,
                      success: false,
                      stderr: h.stderr,
                    },
              )
              const jsonResult: Record<string, unknown> = {
                result: 'error',
                code: 'HOOK_FAILED',
                hooks: jsonHooks,
                failedHooks: result.failedHooks.map((hook) => ({
                  id: hook.id,
                  command: hook.command,
                  exitCode: hook.exitCode,
                  success: false,
                  stderr: hook.stderr,
                })),
              }
              writeStructuredRecord(fmt, {
                stream: 'run-hooks',
                event: { type: 'complete', result: jsonResult },
              })
            }
            process.exit(2)
            return
          }

          // Success
          if (fmt !== 'text') {
            writeStructuredRecord(fmt, {
              stream: 'run-hooks',
              event: {
                type: 'complete',
                result: {
                  result: 'ok',
                  hooks: result.hooks.map((h) => ({
                    id: h.id,
                    command: h.command,
                    exitCode: h.exitCode,
                    success: true,
                  })),
                },
              },
            })
          }
        } catch (err) {
          handleError(err, opts.format)
        }
      },
    )
}
