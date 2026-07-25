import { type Command } from 'commander'
import { type SpecMetadata } from '@specd/sdk'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'
import { parseSpecId } from '../../helpers/spec-path.js'

/**
 * Formats metadata as structured text for terminal output.
 *
 * @param specId - Canonical spec identifier
 * @param metadata - Materialized metadata payload
 * @param source - Metadata source from materialization
 * @param regenerated - Whether metadata was regenerated in this call
 * @param metadataFingerprint - Metadata fingerprint hash
 * @param warnings - Materialization warnings
 * @returns Structured text output
 */
function formatMetadataText(
  specId: string,
  metadata: SpecMetadata,
  source: 'persisted' | 'generated',
  regenerated: boolean,
  metadataFingerprint: string,
  warnings: ReadonlyArray<{ kind: string; specId: string; error: string }>,
): string {
  const lines: string[] = [
    `spec: ${specId}`,
    `source: ${source}`,
    `regenerated: ${regenerated}`,
    `metadataFingerprint: ${metadataFingerprint}`,
  ]

  if (metadata.title !== undefined && metadata.title !== '') {
    lines.push(`title: ${metadata.title}`)
  }
  if (metadata.description !== undefined && metadata.description !== '') {
    lines.push(`description: ${metadata.description}`)
  }
  if (metadata.generatedBy !== undefined) {
    lines.push(`generatedBy: ${metadata.generatedBy}`)
  }

  const rules = metadata.rules ?? []
  const constraints = metadata.constraints ?? []
  const scenarios = metadata.scenarios ?? []
  if (rules.length > 0) lines.push(`rules: ${rules.length}`)
  if (constraints.length > 0) lines.push(`constraints: ${constraints.length}`)
  if (scenarios.length > 0) lines.push(`scenarios: ${scenarios.length}`)

  if (metadata.dependsOn !== undefined && metadata.dependsOn.length > 0) {
    lines.push('dependsOn:')
    for (const dep of metadata.dependsOn) {
      lines.push(`  - ${dep}`)
    }
  }

  if (warnings.length > 0) {
    lines.push('warnings:')
    for (const warning of warnings) {
      lines.push(`  ${warning.kind}: ${warning.error}`)
    }
  }

  return lines.join('\n')
}

/**
 * Registers the `spec metadata` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerSpecMetadata(parent: Command): void {
  parent
    .command('metadata <specPath>')
    .allowExcessArguments(false)
    .description(
      'Display self-healed metadata for a spec, including source and regeneration diagnostics.',
    )
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  {
    spec: string
    source: "persisted" | "generated"
    regenerated: boolean
    metadataFingerprint: string
    warnings: Array<{ kind, specId, error }>
    metadata: object
  }
`,
    )
    .action(async (specPath: string, opts: { format: string; config?: string }) => {
      try {
        const { config, kernel } = await resolveCliContext({ configPath: opts.config })
        const specId = parseSpecId(specPath, config).specId
        const result = await kernel.specs.getMetadata.execute({ specId })
        const fmt = parseFormat(opts.format)

        if (fmt === 'text') {
          output(
            formatMetadataText(
              specId,
              result.metadata,
              result.source,
              result.regenerated,
              result.metadataFingerprint,
              result.warnings,
            ),
            'text',
          )
        } else {
          output(
            {
              spec: specId,
              source: result.source,
              regenerated: result.regenerated,
              metadataFingerprint: result.metadataFingerprint,
              warnings: result.warnings,
              metadata: result.metadata,
            },
            fmt,
          )
        }
      } catch (err) {
        handleError(err, opts.format)
      }
    })
}
