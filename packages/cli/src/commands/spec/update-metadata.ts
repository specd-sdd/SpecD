import * as fs from 'node:fs/promises'
import { type Command } from 'commander'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError, cliError } from '../../handle-error.js'
import { parseSpecId } from '../../helpers/spec-path.js'
import { readStdin } from '../../helpers/read-stdin.js'
import YAML from 'yaml'

/**
 * Registers the `spec update-metadata` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerSpecUpdateMetadata(parent: Command): void {
  parent
    .command('update-metadata <specPath>')
    .allowExcessArguments(false)
    .description(
      'Update spec metadata with LLM-optimized fields (description, context), performing a fresh extraction and merge.',
    )
    .option('--file <path>', 'read JSON/YAML content from a file instead of stdin')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  { result: "ok", spec: string }
`,
    )
    .action(async (specPath: string, opts: { format: string; config?: string; file?: string }) => {
      try {
        const { config, kernel } = await resolveCliContext({ configPath: opts.config })

        // Read content from --file or stdin
        let content: string
        if (opts.file !== undefined) {
          content = await fs.readFile(opts.file, 'utf-8')
        } else {
          content = await readStdin()
        }

        // Parse YAML/JSON
        const payload = YAML.parse(content) as Record<string, unknown>

        if (typeof payload !== 'object' || payload === null) {
          cliError('payload must be an object', opts.format)
        }

        const { workspace, capabilityPath } = parseSpecId(specPath, config)

        const result = await kernel.specs.updateMetadata.execute({
          workspace,
          capabilityPath,
          payload: payload as {
            readonly optimizedDescription?: string
            readonly optimizedContext?: string
          },
        })

        const fmt = parseFormat(opts.format)
        if (fmt === 'text') {
          output(`updated metadata for ${result.spec}`, 'text')
        } else {
          output({ result: 'ok', spec: result.spec }, fmt)
        }
      } catch (err) {
        handleError(err, opts.format)
      }
    })
}
