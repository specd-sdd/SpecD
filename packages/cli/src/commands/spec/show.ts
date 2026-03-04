import { type Command } from 'commander'
import { SpecPath } from '@specd/core'
import { createCliKernel } from '../../kernel.js'
import { loadConfig } from '../../load-config.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'
import { parseSpecId } from '../../helpers/spec-path.js'

/**
 * Registers the `spec show` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerSpecShow(parent: Command): void {
  parent
    .command('show <specPath>')
    .description('Show the contents of a spec')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (specPath: string, opts: { format: string; config?: string }) => {
      try {
        const config = await loadConfig({ configPath: opts.config })
        const kernel = createCliKernel(config)
        const parsed = parseSpecId(specPath, config)

        const result = await kernel.specs.get.execute({
          workspace: parsed.workspace,
          specPath: SpecPath.parse(parsed.capabilityPath),
        })

        if (result === null) {
          process.stderr.write(`error: spec '${specPath}' not found\n`)
          process.exit(1)
        }

        // Filter out internal metadata — not user-facing spec content
        const visibleArtifacts = new Map(
          [...result.artifacts.entries()].filter(([k]) => k !== '.specd-metadata.yaml'),
        )

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
        handleError(err)
      }
    })
}
