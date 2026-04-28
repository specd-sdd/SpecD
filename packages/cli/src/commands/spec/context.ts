import { type Command } from 'commander'
import { SpecPath, type SpecContextEntry } from '@specd/core'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError, cliError } from '../../handle-error.js'
import { parseSpecId } from '../../helpers/spec-path.js'

/**
 * Renders a SpecContextEntry as text.
 *
 * @param entry - The context entry to render.
 * @returns The formatted text block.
 */
function renderEntryText(entry: SpecContextEntry): string {
  const parts: string[] = [
    `### Spec: ${entry.spec}`,
    `Mode: ${entry.mode}`,
    `Source: ${entry.source}`,
  ]

  if (entry.description !== undefined) {
    parts.push(`**Description:** ${entry.description}`)
  }
  if (entry.rules !== undefined) {
    const rulesText = entry.rules
      .map((r) => `#### ${r.requirement}\n${r.rules.map((rule) => `- ${rule}`).join('\n')}`)
      .join('\n\n')
    parts.push(`### Rules\n\n${rulesText}`)
  }
  if (entry.constraints !== undefined) {
    const constraintsText = entry.constraints.map((c) => `- ${c}`).join('\n')
    parts.push(`### Constraints\n\n${constraintsText}`)
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
    parts.push(`### Scenarios\n\n${scenariosText}`)
  }

  return parts.join('\n\n')
}

/**
 * Registers the `spec context` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerSpecContext(parent: Command): void {
  parent
    .command('context <specPath>')
    .allowExcessArguments(false)
    .description(
      'Compile and print the context block for a spec, including relevant rules, constraints, and scenarios.',
    )
    .option('--mode <mode>', 'display mode: list|summary|full|hybrid', 'full')
    .option('--rules', 'include only rules sections')
    .option('--constraints', 'include only constraints sections')
    .option('--scenarios', 'include only scenarios sections')
    .option('--follow-deps', 'follow dependsOn links transitively')
    .option('--depth <n>', 'limit dependency traversal depth (requires --follow-deps)')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  {
    specs: Array<{
      spec: string
      title?: string
      description?: string
      rules?: Array<{ requirement: string, rules: string[] }>
      constraints?: string[]
      scenarios?: Array<{ name: string, requirement: string, given?: string[], when?: string[], then?: string[] }>
      stale: boolean
    }>
    warnings: string[]
  }
`,
    )
    .action(
      async (
        specPath: string,
        opts: {
          mode: 'list' | 'summary' | 'full' | 'hybrid'
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
            cliError('--depth requires --follow-deps', opts.format)
          }

          const { config, kernel } = await resolveCliContext({ configPath: opts.config })
          const parsed = parseSpecId(specPath, config)

          // Build section filter
          const sectionFlags: Array<'rules' | 'constraints' | 'scenarios'> = []
          if (opts.rules) sectionFlags.push('rules')
          if (opts.constraints) sectionFlags.push('constraints')
          if (opts.scenarios) sectionFlags.push('scenarios')

          const result = await kernel.specs.getContext.execute({
            workspace: parsed.workspace,
            specPath: SpecPath.parse(parsed.capabilityPath),
            ...(opts.followDeps === true ? { followDeps: true } : {}),
            ...(opts.depth !== undefined ? { depth: parseInt(opts.depth, 10) } : {}),
            contextMode: opts.mode,
            ...(sectionFlags.length > 0 ? { sections: sectionFlags } : {}),
          })

          const fmt = parseFormat(opts.format)

          // Emit warnings to stderr
          for (const w of result.warnings) {
            process.stderr.write(`warning: ${w.message}\n`)
          }

          if (result.entries.length === 0) {
            cliError(`spec '${specPath}' not found`, opts.format)
          }

          if (fmt === 'text') {
            const textParts = result.entries.map(renderEntryText)
            output(textParts.join('\n\n'), 'text')
          } else {
            // Clean up entries for JSON: remove undefined fields
            const jsonSpecs = result.entries.map((e) => {
              const obj: Record<string, unknown> = {
                spec: e.spec,
                mode: e.mode,
                source: e.source,
              }
              if (e.title !== undefined) obj.title = e.title
              if (e.description !== undefined) obj.description = e.description
              if (e.rules !== undefined) obj.rules = e.rules
              if (e.constraints !== undefined) obj.constraints = e.constraints
              if (e.scenarios !== undefined) obj.scenarios = e.scenarios
              obj.stale = e.stale
              return obj
            })
            const warnings = result.warnings.map((w) => w.message)
            output({ specs: jsonSpecs, warnings }, fmt)
          }
        } catch (err) {
          handleError(err, opts.format)
        }
      },
    )
}
