import * as path from 'node:path'
import { type Command } from 'commander'
import { SpecPath } from '@specd/core'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError, cliError } from '../../handle-error.js'
import { parseSpecId } from '../../helpers/spec-path.js'

/**
 * Registers the `spec show` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerSpecShow(parent: Command): void {
  parent
    .command('show <specPath>')
    .allowExcessArguments(false)
    .description(
      'Display the full content of a spec artifact, rendered from its source files on disk.',
    )
    .option('--artifact <name>', 'filter by artifact ID (e.g. specs, verify)')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  Array<{ filename: string, content: string }>
`,
    )
    .action(
      async (specPath: string, opts: { artifact?: string; format: string; config?: string }) => {
        try {
          const { config, kernel } = await resolveCliContext({ configPath: opts.config })
          const parsed = parseSpecId(specPath, config)

          const result = await kernel.specs.get.execute({
            workspace: parsed.workspace,
            specPath: SpecPath.parse(parsed.capabilityPath),
          })

          if (result === null) {
            cliError(`spec '${specPath}' not found`, opts.format)
          }

          let visibleArtifacts = new Map(
            [...result.artifacts.entries()].filter(([k]) => k !== '.specd-metadata.yaml'),
          )

          if (opts.artifact !== undefined) {
            const result = await kernel.specs.getActiveSchema.execute()
            if (result.raw) {
              // This branch is unreachable given we don't pass { raw: true }
              throw new Error('Unexpected raw schema result')
            }
            const schema = result.schema
            const artifactType = schema.artifact(opts.artifact)

            if (artifactType === null) {
              cliError(`unknown artifact ID '${opts.artifact}' in schema`, opts.format)
            }

            if (artifactType.scope !== 'spec') {
              cliError(
                `artifact '${opts.artifact}' has scope '${artifactType.scope}' (must be 'spec' to show)`,
                opts.format,
              )
            }

            const targetFilename = path.basename(artifactType.output)
            const artifact = visibleArtifacts.get(targetFilename)

            if (artifact === undefined) {
              cliError(
                `artifact '${opts.artifact}' (${targetFilename}) not found on disk for spec '${specPath}'`,
                opts.format,
              )
            }

            visibleArtifacts = new Map([[targetFilename, artifact]])
          }

          const fmt = parseFormat(opts.format)
          if (fmt === 'text') {
            const parts: string[] = []
            for (const [filename, artifact] of visibleArtifacts) {
              parts.push(`--- ${filename} ---\n${artifact.content}`)
            }
            output(parts.join('\n\n'), 'text')
          } else {
            output(
              [...visibleArtifacts.entries()].map(([filename, artifact]) => ({
                filename,
                content: artifact.content,
              })),
              fmt,
            )
          }
        } catch (err) {
          handleError(err, opts.format)
        }
      },
    )
}
