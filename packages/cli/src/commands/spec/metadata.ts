import { type Command } from 'commander'
import { parse as parseYaml } from 'yaml'
import {
  SpecPath,
  createArtifactParserRegistry,
  checkMetadataFreshness,
  type ArtifactNode,
  type ArtifactAST,
  type Selector,
  type Schema,
} from '@specd/core'
import { createCliKernel } from '../../kernel.js'
import { loadConfig } from '../../load-config.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'
import { parseSpecId } from '../../helpers/spec-path.js'
import { buildWorkspaceSchemasPaths } from '../../helpers/workspace-map.js'

/** Parsed `.specd-metadata.yaml` content. */
interface SpecMetadata {
  title?: string
  description?: string
  dependsOn?: string[]
  contentHashes?: Record<string, string>
  rules?: Array<{ requirement: string; rules: string[] }>
  constraints?: string[]
  scenarios?: Array<{
    requirement: string
    name: string
    given?: string[]
    when?: string[]
    then?: string[]
  }>
}

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

          const metadataArtifact = result.artifacts.get('.specd-metadata.yaml')
          const hasMetadata = metadataArtifact !== undefined

          if (!hasMetadata && !opts.infer) {
            process.stderr.write(`error: no .specd-metadata.yaml for spec '${specPath}'\n`)
            process.exit(1)
            return
          }

          const metadata: SpecMetadata = (() => {
            if (!hasMetadata) return {}
            try {
              return (parseYaml(metadataArtifact.content) as SpecMetadata) ?? {}
            } catch {
              return {}
            }
          })()

          const specLabel = `${parsed.workspace}:${parsed.capabilityPath}`

          // Compute freshness for each content hash
          const freshnessResult = await checkMetadataFreshness(metadata.contentHashes, (filename) =>
            Promise.resolve(result.artifacts.get(filename)?.content ?? null),
          )
          const hashEntries = freshnessResult.entries
          const allFresh = freshnessResult.allFresh

          // Determine whether to infer semantic sections
          const shouldInfer = opts.infer === true && !allFresh
          const inferredRules: string[] = []
          const inferredConstraints: string[] = []
          const inferredScenarios: string[] = []

          if (shouldInfer) {
            const workspaceSchemasPaths = buildWorkspaceSchemasPaths(config)
            const schema: Schema = await kernel.specs.getActiveSchema.execute({
              schemaRef: config.schemaRef,
              workspaceSchemasPaths,
            })

            const registry = createArtifactParserRegistry()

            // Check that at least one artifact file exists (excluding metadata)
            const artifactFiles = [...result.artifacts.keys()].filter(
              (f) => f !== '.specd-metadata.yaml',
            )
            if (artifactFiles.length === 0) {
              process.stderr.write(`error: no artifact files for spec '${specPath}'\n`)
              process.exit(1)
              return
            }

            // Extract semantic sections from each spec-scoped artifact
            for (const artifactType of schema.artifacts()) {
              if (artifactType.scope() !== 'spec') continue

              const format = artifactType.format()
              if (format === undefined) continue
              const parser = registry.get(format)
              if (parser === undefined) continue

              const filename = artifactType.output()
              const artifact = result.artifacts.get(filename)
              if (artifact === undefined) continue

              const ast = parser.parse(artifact.content)

              for (const section of artifactType.contextSections()) {
                const nodes = findNodes(ast, section.selector)
                for (const node of nodes) {
                  const extracted =
                    section.extract === 'label'
                      ? (node.label ?? '')
                      : section.extract === 'both'
                        ? `${node.label ?? ''}: ${parser.renderSubtree(node)}`
                        : parser.renderSubtree(node)

                  if (extracted.trim() === '') continue

                  switch (section.role) {
                    case 'rules':
                      inferredRules.push(extracted)
                      break
                    case 'constraints':
                      inferredConstraints.push(extracted)
                      break
                    case 'scenarios':
                      inferredScenarios.push(extracted)
                      break
                  }
                }
              }
            }
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

/**
 * Finds all AST nodes matching the given selector within an artifact AST.
 *
 * @param ast - The parsed artifact AST.
 * @param selector - The selector criteria to match.
 * @returns Array of matching nodes.
 */
function findNodes(ast: ArtifactAST, selector: Selector): ArtifactNode[] {
  const results: ArtifactNode[] = []
  collectNodes(ast.root, selector, [], results)
  return results
}

/**
 * Recursively collects nodes matching the selector, tracking the ancestor chain.
 *
 * @param node - The current node being examined.
 * @param selector - The selector criteria to match.
 * @param ancestors - Chain of ancestor nodes from root.
 * @param results - Mutable array to collect matches.
 */
function collectNodes(
  node: ArtifactNode,
  selector: Selector,
  ancestors: readonly ArtifactNode[],
  results: ArtifactNode[],
): void {
  if (selectorMatches(node, selector, ancestors)) {
    results.push(node)
  }
  const newAncestors = [...ancestors, node]
  for (const child of node.children ?? []) {
    collectNodes(child, selector, newAncestors, results)
  }
}

/**
 * Returns `true` if `node` matches all criteria in `selector`.
 *
 * @param node - The node to test.
 * @param selector - The selector criteria.
 * @param ancestors - Chain of ancestor nodes for parent matching.
 * @returns True if the node matches.
 */
function selectorMatches(
  node: ArtifactNode,
  selector: Selector,
  ancestors: readonly ArtifactNode[],
): boolean {
  if (node.type !== selector.type) return false

  if (selector.matches !== undefined) {
    const regex = new RegExp(selector.matches, 'i')
    if (!regex.test(node.label ?? '')) return false
  }

  if (selector.contains !== undefined) {
    const regex = new RegExp(selector.contains, 'i')
    if (!regex.test(String(node.value ?? ''))) return false
  }

  if (selector.parent !== undefined) {
    const nearestOfType = [...ancestors].reverse().find((a) => a.type === selector.parent!.type)
    if (nearestOfType === undefined) return false
    if (!selectorMatches(nearestOfType, selector.parent, [])) return false
  }

  return true
}
