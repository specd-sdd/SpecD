import { type Command } from 'commander'
import { SpecPath, checkMetadataFreshness, parseMetadata, NodeContentHasher } from '@specd/core'

const hasher = new NodeContentHasher()
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError, cliError } from '../../handle-error.js'
import { parseSpecId } from '../../helpers/spec-path.js'

/**
 * Registers the `spec metadata` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerSpecMetadata(parent: Command): void {
  parent
    .command('metadata <specPath>')
    .allowExcessArguments(false)
    .description('Show the metadata for a spec')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  {
    spec: string
    fresh: boolean
    title?: string
    description?: string
    generatedBy?: string
    contentHashes: Array<{ filename: string, recorded: string, current: string, fresh: boolean }>
    dependsOn?: string[]
    keywords?: string[]
    rules: Array<{ requirement: string, rules: string[] }>
    constraints: string[]
    scenarios: Array<{ name: string, requirement: string, given?: string[], when?: string[], then?: string[] }>
  }
`,
    )
    .action(async (specPath: string, opts: { format: string; config?: string }) => {
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

        const metadataArtifact = result.artifacts.get('.specd-metadata.yaml')

        if (metadataArtifact === undefined) {
          cliError(`no .specd-metadata.yaml for spec '${specPath}'`, opts.format)
        }

        const metadata = parseMetadata(metadataArtifact.content)

        const specLabel = `${parsed.workspace}:${parsed.capabilityPath}`

        // Compute freshness for each content hash
        const freshnessResult = await checkMetadataFreshness(
          metadata.contentHashes,
          (filename) => Promise.resolve(result.artifacts.get(filename)?.content ?? null),
          (c) => hasher.hash(c),
        )
        const hashEntries = freshnessResult.entries
        const allFresh = freshnessResult.allFresh

        const effectiveRules = metadata.rules ?? []
        const effectiveConstraints = metadata.constraints ?? []
        const effectiveScenarios = metadata.scenarios ?? []

        const fmt = parseFormat(opts.format)
        if (fmt === 'text') {
          const lines: string[] = [`spec: ${specLabel}`]

          lines.push('')

          if (metadata.title !== undefined) lines.push(`title:       ${metadata.title}`)
          if (metadata.description !== undefined) lines.push(`description: ${metadata.description}`)
          if (metadata.generatedBy !== undefined) lines.push(`generatedBy: ${metadata.generatedBy}`)
          if (
            metadata.title !== undefined ||
            metadata.description !== undefined ||
            metadata.generatedBy !== undefined
          )
            lines.push('')

          if (hashEntries.length > 0) {
            lines.push('content hashes:')
            for (const h of hashEntries) {
              lines.push(`  ${h.filename}  ${h.fresh ? 'fresh' : 'STALE'}`)
            }
            lines.push('')
          }

          if (metadata.dependsOn !== undefined && metadata.dependsOn.length > 0) {
            lines.push('dependsOn:')
            for (const dep of metadata.dependsOn) {
              lines.push(`  ${dep}`)
            }
            lines.push('')
          }

          const counts: string[] = []
          if (effectiveRules.length > 0) counts.push(`rules:       ${effectiveRules.length}`)
          if (effectiveConstraints.length > 0)
            counts.push(`constraints: ${effectiveConstraints.length}`)
          if (effectiveScenarios.length > 0)
            counts.push(`scenarios:   ${effectiveScenarios.length}`)
          if (counts.length > 0) lines.push(...counts)

          output(lines.join('\n'), 'text')
        } else {
          const jsonObj: Record<string, unknown> = {
            spec: specLabel,
            fresh: allFresh,
          }
          if (metadata.title !== undefined) jsonObj.title = metadata.title
          if (metadata.description !== undefined) jsonObj.description = metadata.description
          if (metadata.generatedBy !== undefined) jsonObj.generatedBy = metadata.generatedBy
          jsonObj.contentHashes = hashEntries
          if (metadata.dependsOn !== undefined) jsonObj.dependsOn = metadata.dependsOn
          if (metadata.keywords !== undefined) jsonObj.keywords = metadata.keywords
          jsonObj.rules = effectiveRules
          jsonObj.constraints = effectiveConstraints
          jsonObj.scenarios = effectiveScenarios
          output(jsonObj, fmt)
        }
      } catch (err) {
        handleError(err, opts.format)
      }
    })
}
