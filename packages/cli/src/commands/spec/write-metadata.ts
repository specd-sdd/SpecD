import * as fs from 'node:fs/promises'
import { type Command } from 'commander'
import { parse as parseYaml } from 'yaml'
import { SpecPath } from '@specd/core'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError, cliError } from '../../handle-error.js'
import { parseSpecId } from '../../helpers/spec-path.js'

/**
 * Registers the `spec write-metadata` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerSpecWriteMetadata(parent: Command): void {
  parent
    .command('write-metadata <specPath>')
    .allowExcessArguments(false)
    .description('Write .specd-metadata.yaml for a spec')
    .option('--input <file>', 'read YAML content from a file instead of stdin')
    .option('--force', 'skip conflict detection and overwrite unconditionally')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(
      async (
        specPath: string,
        opts: { format: string; config?: string; input?: string; force?: boolean },
      ) => {
        try {
          const { config, kernel } = await resolveCliContext({ configPath: opts.config })
          const parsed = parseSpecId(specPath, config)

          // Read content from --input file or stdin
          let content: string
          if (opts.input !== undefined) {
            content = await fs.readFile(opts.input, 'utf-8')
          } else {
            content = await readStdin()
          }

          // Validate YAML at the CLI boundary
          try {
            parseYaml(content)
          } catch (yamlErr) {
            const msg = yamlErr instanceof Error ? yamlErr.message : String(yamlErr)
            cliError(`invalid YAML: ${msg}`, opts.format)
          }

          const result = await kernel.specs.saveMetadata.execute({
            workspace: parsed.workspace,
            specPath: SpecPath.parse(parsed.capabilityPath),
            content,
            ...(opts.force === true ? { force: true } : {}),
          })

          if (result === null) {
            cliError(`spec '${specPath}' not found`, opts.format)
          }

          const fmt = parseFormat(opts.format)
          if (fmt === 'text') {
            output(`wrote .specd-metadata.yaml for ${result.spec}`, 'text')
          } else {
            output({ result: 'ok', spec: result.spec }, fmt)
          }
        } catch (err) {
          handleError(err, opts.format)
        }
      },
    )
}

/**
 * Reads all of stdin until EOF and returns the content as a string.
 *
 * @returns The full stdin content.
 */
function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    process.stdin.on('data', (chunk: Buffer) => chunks.push(chunk))
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    process.stdin.on('error', reject)
  })
}
