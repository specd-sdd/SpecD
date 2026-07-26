import { type Command } from 'commander'
import { type SpecSection, changeContextToMarkdown } from '@specd/sdk'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError, cliError } from '../../handle-error.js'

/**
 * Registers the `change context` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerChangeContext(parent: Command): void {
  parent
    .command('context <name> <step>')
    .allowExcessArguments(false)
    .description(
      'Compile and print the full context block for a change, including relevant specs, rules, and constraints for the current lifecycle step.',
    )
    .option('--mode <mode>', 'display mode: list|summary|full|hybrid')
    .option('--rules', 'include only rules sections in spec content')
    .option('--constraints', 'include only constraints sections in spec content')
    .option('--scenarios', 'include only scenarios sections in spec content')
    .option(
      '--include-change-specs',
      'directly include change specIds as context seeds (default: false)',
    )
    .option('--follow-deps', 'follow dependsOn links to include transitive spec dependencies')
    .option(
      '--depth <n>',
      'limit dependsOn traversal to N levels (requires --follow-deps)',
      parseInt,
    )
    .option('--optimized', 'force prefer optimized context')
    .option('--no-optimized', 'suppress preference for optimized context')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--fingerprint <hash>', 'skip if context unchanged')
    .option('--config <path>', 'path to specd.yaml')
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  {
    contextFingerprint: string
    status: 'changed' | 'unchanged'
    projectContext: ProjectContextEntry[]
    specs: ContextSpecEntry[]
    warnings: ContextWarning[]
  }

When status is 'unchanged', projectContext and specs are omitted from the structured output.
Lifecycle state and readiness are available from change status, not from this command.
`,
    )
    .action(
      async (
        name: string,
        step: string,
        opts: {
          mode?: 'list' | 'summary' | 'full' | 'hybrid'
          rules?: boolean
          constraints?: boolean
          scenarios?: boolean
          includeChangeSpecs?: boolean
          followDeps?: boolean
          depth?: number
          optimized?: boolean
          format: string
          fingerprint?: string
          config?: string
        },
      ) => {
        try {
          if (opts.depth !== undefined && !opts.followDeps) {
            cliError('--depth requires --follow-deps', opts.format)
          }

          const { config, kernel } = await resolveCliContext({ configPath: opts.config })

          const llmOptimizedContext = (() => {
            if (opts.optimized === false) return false
            if (opts.optimized === true) return true
            return config.llmOptimizedContext ?? false
          })()

          const sectionFlags: SpecSection[] = []
          if (opts.rules) sectionFlags.push('rules')
          if (opts.constraints) sectionFlags.push('constraints')
          if (opts.scenarios) sectionFlags.push('scenarios')

          const effectiveMode =
            opts.mode ??
            (sectionFlags.length > 0 &&
            config.contextMode !== 'full' &&
            config.contextMode !== 'hybrid'
              ? 'hybrid'
              : config.contextMode)

          await kernel.changes.refreshImplementationTracking.execute({ name })

          const result = await kernel.changes.compile.execute({
            name,
            step,
            ...(effectiveMode !== undefined ? { contextMode: effectiveMode } : {}),
            ...(llmOptimizedContext !== (config.llmOptimizedContext ?? false)
              ? { llmOptimizedContext }
              : {}),
            includeChangeSpecs: opts.includeChangeSpecs === true,
            ...(opts.followDeps ? { followDeps: true } : {}),
            ...(opts.depth !== undefined ? { depth: opts.depth } : {}),
            ...(sectionFlags.length > 0 ? { sections: sectionFlags } : {}),
            ...(opts.fingerprint !== undefined ? { fingerprint: opts.fingerprint } : {}),
          })

          const fmt = parseFormat(opts.format)
          const isOptimizedRequested =
            llmOptimizedContext &&
            (sectionFlags.length === 0 ||
              (sectionFlags.includes('rules') && sectionFlags.includes('constraints')))

          for (const w of result.warnings) {
            if (w.type === 'stale-optimization' && !isOptimizedRequested) {
              continue
            }
            process.stderr.write(`warning: ${w.message}\n`)
          }

          if (fmt === 'text') {
            output(changeContextToMarkdown(result, { changeName: name }), 'text')
          } else {
            output(result, fmt)
          }
        } catch (err) {
          handleError(err, opts.format)
        }
      },
    )
}
