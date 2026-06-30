import * as fs from 'node:fs/promises'
import { type Command } from 'commander'
import { type UpdateProjectMetadataPayload } from '@specd/sdk'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError, cliError } from '../../handle-error.js'
import { readStdin } from '../../helpers/read-stdin.js'
import YAML from 'yaml'

/**
 * Registers the `project update-metadata` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerProjectUpdateMetadata(parent: Command): void {
  parent
    .command('update-metadata')
    .allowExcessArguments(false)
    .description('Update project-level metadata with LLM-optimized context and input hashes.')
    .option('--file <path>', 'read JSON/YAML content from a file instead of stdin')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  { result: "ok", path: string }
`,
    )
    .action(async (opts: { format: string; config?: string; file?: string }) => {
      try {
        const { kernel } = await resolveCliContext({ configPath: opts.config })

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

        const result = await kernel.project.updateMetadata.execute({
          payload: payload as UpdateProjectMetadataPayload,
        })

        const fmt = parseFormat(opts.format)
        if (fmt === 'text') {
          output(`updated project metadata at ${result.path}`, 'text')
        } else {
          output({ result: 'ok', path: result.path }, fmt)
        }
      } catch (err) {
        handleError(err, opts.format)
      }
    })
}
