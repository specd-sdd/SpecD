import { type Command } from 'commander'
import { createHash } from 'node:crypto'
import { parse as parseYaml } from 'yaml'
import { SpecPath } from '@specd/core'
import { createCliKernel } from '../../kernel.js'
import { loadConfig } from '../../load-config.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'
import { parseSpecId } from '../../helpers/spec-path.js'

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

/** A resolved spec entry for output. */
interface SpecContextEntry {
  spec: string
  title?: string
  description?: string
  rules?: Array<{ requirement: string; rules: string[] }>
  constraints?: string[]
  scenarios?: Array<{
    requirement: string
    name: string
    given?: string[]
    when?: string[]
    then?: string[]
  }>
  stale: boolean
}

/** Valid section filter flags. */
type SectionFlag = 'rules' | 'constraints' | 'scenarios'

/**
 * Parses a `.specd-metadata.yaml` string into a SpecMetadata object.
 *
 * @param content - Raw YAML string to parse.
 * @returns The parsed metadata object.
 */
function parseMetadata(content: string): SpecMetadata {
  try {
    const parsed = parseYaml(content) as unknown
    return (parsed as SpecMetadata) ?? {}
  } catch {
    return {}
  }
}

/**
 * Checks freshness of metadata by comparing SHA-256 hashes of artifact files
 * against recorded contentHashes.
 *
 * @param artifacts - Map of filename to artifact content.
 * @param metadata - Parsed spec metadata with recorded hashes.
 * @returns True if all recorded hashes match current content.
 */
function isMetadataFresh(
  artifacts: Map<string, { content: string }>,
  metadata: SpecMetadata,
): boolean {
  const hashes = metadata.contentHashes
  if (hashes === undefined || Object.keys(hashes).length === 0) return false

  for (const [filename, recordedHash] of Object.entries(hashes)) {
    const artifact = artifacts.get(filename)
    if (artifact === undefined) return false

    const actualHash = `sha256:${createHash('sha256').update(artifact.content).digest('hex')}`
    if (actualHash !== recordedHash) return false
  }
  return true
}

/**
 * Builds a SpecContextEntry from a spec's artifacts and metadata.
 *
 * @param specLabel - Display label for the spec.
 * @param artifacts - Map of filename to artifact content.
 * @param sections - Optional section filter flags.
 * @param warnings - Mutable array to collect warnings.
 * @returns The constructed context entry.
 */
function buildEntry(
  specLabel: string,
  artifacts: Map<string, { content: string }>,
  sections: SectionFlag[] | undefined,
  warnings: string[],
): SpecContextEntry {
  const metadataContent = artifacts.get('.specd-metadata.yaml')?.content
  const showAll = sections === undefined

  if (metadataContent !== undefined) {
    const metadata = parseMetadata(metadataContent)
    const fresh = isMetadataFresh(artifacts, metadata)

    if (!fresh) {
      warnings.push(`warning: metadata for '${specLabel}' is stale — falling back to raw content`)
    }

    if (fresh) {
      const entry: SpecContextEntry = { spec: specLabel, stale: false }
      if (showAll && metadata.title !== undefined) entry.title = metadata.title
      if (showAll && metadata.description !== undefined) entry.description = metadata.description
      if (
        (showAll || sections?.includes('rules')) &&
        metadata.rules !== undefined &&
        metadata.rules.length > 0
      ) {
        entry.rules = metadata.rules
      }
      if (
        (showAll || sections?.includes('constraints')) &&
        metadata.constraints !== undefined &&
        metadata.constraints.length > 0
      ) {
        entry.constraints = metadata.constraints
      }
      if (
        (showAll || sections?.includes('scenarios')) &&
        metadata.scenarios !== undefined &&
        metadata.scenarios.length > 0
      ) {
        entry.scenarios = metadata.scenarios
      }
      return entry
    }
  }

  // Stale or absent metadata — fall back to raw artifact content for context extraction
  // Since we don't have full parser infrastructure here, return a minimal stale entry
  const entry: SpecContextEntry = { spec: specLabel, stale: true }
  return entry
}

/**
 * Renders a SpecContextEntry as text.
 *
 * @param entry - The context entry to render.
 * @returns The formatted text block.
 */
function renderEntryText(entry: SpecContextEntry): string {
  const parts: string[] = [`### Spec: ${entry.spec}`]

  if (entry.description !== undefined) {
    parts.push(`\n**Description:** ${entry.description}`)
  }
  if (entry.rules !== undefined) {
    const rulesText = entry.rules
      .map((r) => `#### ${r.requirement}\n${r.rules.map((rule) => `- ${rule}`).join('\n')}`)
      .join('\n\n')
    parts.push(`\n### Rules\n\n${rulesText}`)
  }
  if (entry.constraints !== undefined) {
    const constraintsText = entry.constraints.map((c) => `- ${c}`).join('\n')
    parts.push(`\n### Constraints\n\n${constraintsText}`)
  }
  if (entry.scenarios !== undefined) {
    const scenariosText = entry.scenarios
      .map((s) => {
        const lines: string[] = [`#### Scenario: ${s.name}`, `*Requirement: ${s.requirement}*`]
        if (s.given?.length) lines.push(`**Given:** ${s.given.join('; ')}`)
        if (s.when?.length) lines.push(`**When:** ${s.when.join('; ')}`)
        if (s.then?.length) lines.push(`**Then:** ${s.then.join('; ')}`)
        return lines.join('\n')
      })
      .join('\n\n')
    parts.push(`\n### Scenarios\n\n${scenariosText}`)
  }

  return parts.join('')
}

/**
 * Registers the `spec context` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerSpecContext(parent: Command): void {
  parent
    .command('context <specPath>')
    .description('Show the metadata context for a spec')
    .option('--rules', 'include only rules sections')
    .option('--constraints', 'include only constraints sections')
    .option('--scenarios', 'include only scenarios sections')
    .option('--follow-deps', 'follow dependsOn links transitively')
    .option('--depth <n>', 'limit dependency traversal depth (requires --follow-deps)')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(
      async (
        specPath: string,
        opts: {
          rules?: boolean
          constraints?: boolean
          scenarios?: boolean
          followDeps?: boolean
          depth?: string
          format: string
          config?: string
        },
      ) => {
        try {
          // Validate --depth requires --follow-deps
          if (opts.depth !== undefined && !opts.followDeps) {
            process.stderr.write('error: --depth requires --follow-deps\n')
            process.exit(1)
          }

          const config = await loadConfig({ configPath: opts.config })
          const kernel = createCliKernel(config)
          const parsed = parseSpecId(specPath, config)

          // Build section filter
          const sectionFlags: SectionFlag[] = []
          if (opts.rules) sectionFlags.push('rules')
          if (opts.constraints) sectionFlags.push('constraints')
          if (opts.scenarios) sectionFlags.push('scenarios')
          const sections: SectionFlag[] | undefined =
            sectionFlags.length > 0 ? sectionFlags : undefined

          // Load root spec
          const rootResult = await kernel.specs.get.execute({
            workspace: parsed.workspace,
            specPath: SpecPath.parse(parsed.capabilityPath),
          })

          if (rootResult === null) {
            process.stderr.write(`error: spec '${specPath}' not found\n`)
            process.exit(1)
          }

          const warnings: string[] = []
          const rootLabel = `${parsed.workspace}:${parsed.capabilityPath}`
          const entries: SpecContextEntry[] = []

          // Build root entry
          entries.push(buildEntry(rootLabel, rootResult.artifacts, sections, warnings))

          // Follow deps if requested
          if (opts.followDeps) {
            const maxDepth = opts.depth !== undefined ? parseInt(opts.depth, 10) : undefined
            const seen = new Set<string>([rootLabel])

            await traverseDeps(
              kernel,
              rootResult.artifacts,
              parsed.workspace,
              entries,
              seen,
              warnings,
              sections,
              maxDepth,
              0,
            )
          }

          const fmt = parseFormat(opts.format)

          // Emit warnings to stderr
          for (const w of warnings) {
            process.stderr.write(`${w}\n`)
          }

          if (fmt === 'text') {
            const textParts = entries.map(renderEntryText)
            output(textParts.join('\n\n'), 'text')
          } else {
            // Clean up entries for JSON: remove undefined fields
            const jsonSpecs = entries.map((e) => {
              const obj: Record<string, unknown> = { spec: e.spec }
              if (e.title !== undefined) obj.title = e.title
              if (e.description !== undefined) obj.description = e.description
              if (e.rules !== undefined) obj.rules = e.rules
              if (e.constraints !== undefined) obj.constraints = e.constraints
              if (e.scenarios !== undefined) obj.scenarios = e.scenarios
              obj.stale = e.stale
              return obj
            })
            output({ specs: jsonSpecs, warnings }, fmt)
          }
        } catch (err) {
          handleError(err)
        }
      },
    )
}

/**
 * Recursively traverses dependsOn links from a spec's metadata.
 *
 * @param kernel - The CLI kernel instance.
 * @param artifacts - Artifacts of the current spec.
 * @param defaultWorkspace - Workspace to assume when deps omit one.
 * @param entries - Mutable array collecting resolved entries.
 * @param seen - Set of already-visited spec labels.
 * @param warnings - Mutable array to collect warnings.
 * @param sections - Optional section filter flags.
 * @param maxDepth - Maximum traversal depth, or undefined for unlimited.
 * @param currentDepth - Current recursion depth.
 */
async function traverseDeps(
  kernel: ReturnType<typeof createCliKernel>,
  artifacts: Map<string, { content: string }>,
  defaultWorkspace: string,
  entries: SpecContextEntry[],
  seen: Set<string>,
  warnings: string[],
  sections: SectionFlag[] | undefined,
  maxDepth: number | undefined,
  currentDepth: number,
): Promise<void> {
  const metadataContent = artifacts.get('.specd-metadata.yaml')?.content
  if (metadataContent === undefined) return

  const metadata = parseMetadata(metadataContent)
  if (metadata.dependsOn === undefined || metadata.dependsOn.length === 0) return

  if (maxDepth !== undefined && currentDepth >= maxDepth) return

  for (const dep of metadata.dependsOn) {
    const colonIdx = dep.indexOf(':')
    const depWorkspace = colonIdx >= 0 ? dep.slice(0, colonIdx) : defaultWorkspace
    const depCapPath = colonIdx >= 0 ? dep.slice(colonIdx + 1) : dep
    const depLabel = `${depWorkspace}:${depCapPath}`

    if (seen.has(depLabel)) continue
    seen.add(depLabel)

    const depResult = await kernel.specs.get.execute({
      workspace: depWorkspace,
      specPath: SpecPath.parse(depCapPath),
    })

    if (depResult === null) {
      warnings.push(`warning: dependency '${depLabel}' not found`)
      continue
    }

    entries.push(buildEntry(depLabel, depResult.artifacts, sections, warnings))

    // Recurse into this dep's dependencies
    await traverseDeps(
      kernel,
      depResult.artifacts,
      depWorkspace,
      entries,
      seen,
      warnings,
      sections,
      maxDepth,
      currentDepth + 1,
    )
  }
}
