import { type Command } from 'commander'
import { stringify } from 'yaml'
import { SpecPath } from '@specd/core'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'
import { parseSpecId } from '../../helpers/spec-path.js'

/**
 * Registers the `spec generate-metadata` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerSpecGenerateMetadata(parent: Command): void {
  parent
    .command('generate-metadata <specPath>')
    .description('Generate .specd-metadata.yaml deterministically from schema extraction rules')
    .option('--write', 'write the generated metadata to the spec directory')
    .option('--force', 'overwrite existing metadata without conflict detection (requires --write)')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(
      async (
        specPath: string,
        opts: { format: string; config?: string; write?: boolean; force?: boolean },
      ) => {
        try {
          const { config, kernel } = await resolveCliContext({ configPath: opts.config })
          const parsed = parseSpecId(specPath, config)

          if (opts.force === true && opts.write !== true) {
            process.stderr.write('error: --force requires --write\n')
            process.exit(1)
            return
          }

          const specId = `${parsed.workspace}:${parsed.capabilityPath}`
          const result = await kernel.specs.generateMetadata.execute({ specId })

          if (!result.hasExtraction) {
            process.stderr.write('error: schema has no metadataExtraction declarations\n')
            process.exit(1)
            return
          }

          const yamlContent = stringify(result.metadata, { lineWidth: 120 })

          if (opts.write === true) {
            await kernel.specs.saveMetadata.execute({
              workspace: parsed.workspace,
              specPath: SpecPath.parse(parsed.capabilityPath),
              content: yamlContent,
              ...(opts.force === true ? { force: true } : {}),
            })

            const fmt = parseFormat(opts.format)
            if (fmt === 'text') {
              output(`wrote .specd-metadata.yaml for ${specId}`, 'text')
            } else {
              output({ result: 'ok', spec: specId, written: true }, fmt)
            }
          } else {
            const fmt = parseFormat(opts.format)
            if (fmt === 'text') {
              output(yamlContent.trimEnd(), 'text')
            } else {
              output({ spec: specId, metadata: result.metadata }, fmt)
            }
          }
        } catch (err) {
          handleError(err)
        }
      },
    )
}
