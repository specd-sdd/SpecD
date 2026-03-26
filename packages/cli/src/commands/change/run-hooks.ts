import { type Command } from 'commander'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'

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
      'Execute all run-hooks defined for a lifecycle phase of a change, triggering any configured side effects.',
    )
    .requiredOption('--phase <phase>', 'hook phase: pre or post')
    .option('--only <hook-id>', 'execute only the hook with this ID')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  Success:
    {
      result: "ok"
      hooks: Array<{ id: string, command: string, exitCode: number, success: true }>
    }
  Failure (exit code 2):
    {
      result: "error"
      code: "HOOK_FAILED"
      hooks: Array<{ id: string, command: string, exitCode: number, success: boolean, stderr?: string }>
      failedHook?: { id: string, exitCode: number }
    }
`,
    )
    .action(
      async (
        name: string,
        step: string,
        opts: { phase: string; only?: string; format: string; config?: string },
      ) => {
        try {
          const { kernel } = await resolveCliContext({ configPath: opts.config })

          const result = await kernel.changes.runStepHooks.execute({
            name,
            step,
            phase: opts.phase as 'pre' | 'post',
            only: opts.only,
          })

          const fmt = parseFormat(opts.format)

          if (result.hooks.length === 0) {
            if (fmt === 'text') {
              output('no hooks to run', 'text')
            } else {
              output({ result: 'ok', hooks: [] }, fmt)
            }
            return
          }

          if (!result.success) {
            if (fmt === 'text') {
              for (const hook of result.hooks) {
                if (hook.success) {
                  output(`ok: ${hook.id}`, 'text')
                } else {
                  process.stdout.write(`failed: ${hook.id} (exit code ${hook.exitCode})\n`)
                  if (hook.stderr) {
                    process.stderr.write(hook.stderr)
                    if (!hook.stderr.endsWith('\n')) process.stderr.write('\n')
                  }
                }
              }
              process.exit(2)
            } else {
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
              }
              if (result.failedHook !== null) {
                jsonResult['failedHook'] = {
                  id: result.failedHook.id,
                  exitCode: result.failedHook.exitCode,
                }
              }
              output(jsonResult, fmt)
              process.exit(2)
            }
            return
          }

          // Success
          if (fmt === 'text') {
            for (const hook of result.hooks) {
              output(`ok: ${hook.id}`, 'text')
            }
          } else {
            output(
              {
                result: 'ok',
                hooks: result.hooks.map((h) => ({
                  id: h.id,
                  command: h.command,
                  exitCode: h.exitCode,
                  success: true,
                })),
              },
              fmt,
            )
          }
        } catch (err) {
          handleError(err, opts.format)
        }
      },
    )
}
