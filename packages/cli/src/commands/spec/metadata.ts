import { type Command } from 'commander'
import { SpecPath, checkMetadataFreshness, parseMetadata, NodeContentHasher } from '@specd/core'

const hasher = new NodeContentHasher()
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'
import { parseSpecId } from '../../helpers/spec-path.js'

/**
 * Registers the `spec metadata` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerSpecMetadata(parent: Command): void {
  parent
    .command('metadata <specPath>')
    .description('Show the metadata for a spec')
    .option('--infer', 'infer semantic sections from artifacts when stale or absent')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(
      async (specPath: string, opts: { format: string; config?: string; infer?: boolean }) => {
        try {
          const { config, kernel } = await resolveCliContext({ configPath: opts.config })
          const parsed = parseSpecId(specPath, config)

          const result = await kernel.specs.get.execute({
            workspace: parsed.workspace,
            specPath: SpecPath.parse(parsed.capabilityPath),
          })

          if (result === null) {
            process.stderr.write(`error: spec '${specPath}' not found\n`)
            process.exit(1)
          }

          const metadataArtifact = result.artifacts.get('.specd-metadata.yaml')
          const hasMetadata = metadataArtifact !== undefined

          if (!hasMetadata && !opts.infer) {
            process.stderr.write(`error: no .specd-metadata.yaml for spec '${specPath}'\n`)
            process.exit(1)
            return
          }

          const metadata = hasMetadata ? parseMetadata(metadataArtifact.content) : {}

          const specLabel = `${parsed.workspace}:${parsed.capabilityPath}`

          // Compute freshness for each content hash
          const freshnessResult = await checkMetadataFreshness(
            metadata.contentHashes,
            (filename) => Promise.resolve(result.artifacts.get(filename)?.content ?? null),
            (c) => hasher.hash(c),
          )
          const hashEntries = freshnessResult.entries
          const allFresh = freshnessResult.allFresh

          // Determine whether to infer semantic sections
          const shouldInfer = opts.infer === true && !allFresh
          let inferredRules: readonly string[] = []
          let inferredConstraints: readonly string[] = []
          let inferredScenarios: readonly string[] = []

          if (shouldInfer) {
            const artifactContents = new Map<string, { content: string }>()
            for (const [filename, artifact] of result.artifacts) {
              if (filename !== '.specd-metadata.yaml') {
                artifactContents.set(filename, { content: artifact.content })
              }
            }

            if (artifactContents.size === 0) {
              process.stderr.write(`error: no artifact files for spec '${specPath}'\n`)
              process.exit(1)
              return
            }

            const inferred = await kernel.specs.inferSections.execute({
              artifacts: artifactContents,
            })

            inferredRules = inferred.rules
            inferredConstraints = inferred.constraints
            inferredScenarios = inferred.scenarios
          }

          // Choose which rules/constraints/scenarios to use
          const source = shouldInfer ? ('inferred' as const) : ('recorded' as const)
          const effectiveRules = shouldInfer ? inferredRules : (metadata.rules ?? [])
          const effectiveConstraints = shouldInfer
            ? inferredConstraints
            : (metadata.constraints ?? [])
          const effectiveScenarios = shouldInfer ? inferredScenarios : (metadata.scenarios ?? [])

          // Title fallback to capability path when metadata is absent
          const effectiveTitle = metadata.title ?? (hasMetadata ? undefined : parsed.capabilityPath)

          const fmt = parseFormat(opts.format)
          if (fmt === 'text') {
            const lines: string[] = [`spec: ${specLabel}`]

            if (opts.infer) lines.push(`source: ${source}`)

            lines.push('')

            if (effectiveTitle !== undefined) lines.push(`title:       ${effectiveTitle}`)
            if (metadata.description !== undefined)
              lines.push(`description: ${metadata.description}`)
            if (effectiveTitle !== undefined || metadata.description !== undefined) lines.push('')

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
            if (opts.infer) jsonObj.source = source
            if (effectiveTitle !== undefined) jsonObj.title = effectiveTitle
            if (metadata.description !== undefined) jsonObj.description = metadata.description
            jsonObj.contentHashes = hashEntries
            if (metadata.dependsOn !== undefined) jsonObj.dependsOn = metadata.dependsOn
            jsonObj.rules = effectiveRules
            jsonObj.constraints = effectiveConstraints
            jsonObj.scenarios = effectiveScenarios
            output(jsonObj, fmt)
          }
        } catch (err) {
          handleError(err)
        }
      },
    )
}
