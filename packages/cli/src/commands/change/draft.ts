import { type Command } from 'commander'
import { createCliKernel } from '../../kernel.js'
import { loadConfig } from '../../load-config.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'

/**
 * Registers the `change draft` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerChangeDraft(parent: Command): void {
  parent
    .command('draft <name>')
    .description('Shelve a change to drafts/')
    .option('--reason <text>', 'reason for shelving')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (name: string, opts: { reason?: string; format: string; config?: string }) => {
      try {
        const config = await loadConfig({ configPath: opts.config })
        const kernel = createCliKernel(config)
        await kernel.changes.draft.execute({
          name,
          ...(opts.reason !== undefined ? { reason: opts.reason } : {}),
        })
        const fmt = parseFormat(opts.format)
        if (fmt === 'text') {
          output(`drafted change ${name}`, 'text')
        } else {
          output({ result: 'ok', name }, fmt)
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes('already drafted')) {
          process.stderr.write(`error: ${err.message}\n`)
          process.exit(1)
        }
        handleError(err)
      }
    })
}
