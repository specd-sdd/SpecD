import { type Command } from 'commander'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'

/**
 * Registers the `change hook-instruction` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerChangeHookInstruction(parent: Command): void {
  parent
    .command('hook-instruction <name> <step>')
    .allowExcessArguments(false)
    .description(
      'Return the hook instruction text for a named lifecycle phase, for use by agents executing that phase.',
    )
    .requiredOption('--phase <phase>', 'hook phase: pre or post')
    .option('--only <hook-id>', 'return only the instruction with this ID')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(
      async (
        name: string,
        step: string,
        opts: { phase: string; only?: string; format: string; config?: string },
      ) => {
        try {
          const { kernel } = await resolveCliContext({ configPath: opts.config })

          const result = await kernel.changes.getHookInstructions.execute({
            name,
            step,
            phase: opts.phase as 'pre' | 'post',
            only: opts.only,
          })

          const fmt = parseFormat(opts.format)

          if (result.instructions.length === 0) {
            if (fmt === 'text') {
              output('no instructions', 'text')
            } else {
              output({ result: 'ok', phase: result.phase, instructions: [] }, fmt)
            }
            return
          }

          if (fmt === 'text') {
            if (opts.only !== undefined) {
              // --only: raw text, no header
              process.stdout.write(result.instructions[0]!.text)
              if (!result.instructions[0]!.text.endsWith('\n')) {
                process.stdout.write('\n')
              }
            } else {
              const parts: string[] = []
              for (const instr of result.instructions) {
                parts.push(`[${result.phase}] ${instr.id}:\n${instr.text}`)
              }
              output(parts.join('\n\n'), 'text')
            }
          } else {
            output(
              {
                result: 'ok',
                phase: result.phase,
                instructions: result.instructions.map((i) => ({ id: i.id, text: i.text })),
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
