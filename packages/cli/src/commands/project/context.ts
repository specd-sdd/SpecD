import { type Command } from 'commander'
import { type CompileContextConfig, type SpecSection } from '@specd/core'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError, cliError } from '../../handle-error.js'

/**
 * Registers the `project context` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerProjectContext(parent: Command): void {
  parent
    .command('context')
    .allowExcessArguments(false)
    .description('Compile and print the project-level context block')
    .option('--rules', 'include only rules sections in spec content')
    .option('--constraints', 'include only constraints sections in spec content')
    .option('--scenarios', 'include only scenarios sections in spec content')
    .option('--follow-deps', 'follow dependsOn links to include transitive spec dependencies')
    .option(
      '--depth <n>',
      'limit dependsOn traversal to N levels (requires --follow-deps)',
      parseInt,
    )
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(
      async (opts: {
        rules?: boolean
        constraints?: boolean
        scenarios?: boolean
        followDeps?: boolean
        depth?: number
        format: string
        config?: string
      }) => {
        try {
          if (opts.depth !== undefined && !opts.followDeps) {
            cliError('--depth requires --follow-deps', opts.format)
          }

          const { config, kernel } = await resolveCliContext({ configPath: opts.config })
          const fmt = parseFormat(opts.format)

          const compileConfig: CompileContextConfig = {
            ...(config.context !== undefined
              ? {
                  context: config.context.map((e) =>
                    'file' in e ? { file: e.file } : { instruction: e.instruction },
                  ),
                }
              : {}),
            ...(config.contextIncludeSpecs !== undefined
              ? { contextIncludeSpecs: [...config.contextIncludeSpecs] }
              : {}),
            ...(config.contextExcludeSpecs !== undefined
              ? { contextExcludeSpecs: [...config.contextExcludeSpecs] }
              : {}),
          }

          const sectionFlags: SpecSection[] = []
          if (opts.rules) sectionFlags.push('rules')
          if (opts.constraints) sectionFlags.push('constraints')
          if (opts.scenarios) sectionFlags.push('scenarios')

          const result = await kernel.project.getProjectContext.execute({
            config: compileConfig,
            ...(opts.followDeps ? { followDeps: true } : {}),
            ...(opts.depth !== undefined ? { depth: opts.depth } : {}),
            ...(sectionFlags.length > 0 ? { sections: sectionFlags } : {}),
          })

          for (const w of result.warnings) {
            process.stderr.write(`warning: ${w.message}\n`)
          }

          if (fmt === 'text') {
            const parts: string[] = [...result.contextEntries]
            if (result.specs.length > 0) {
              const specParts = result.specs.map(
                (s) => `### Spec: ${s.specId}\n\n${s.content ?? ''}`,
              )
              parts.push(`## Spec content\n\n${specParts.join('\n\n---\n\n')}`)
            }
            if (parts.length === 0) {
              output('no project context configured', 'text')
            } else {
              output(parts.join('\n\n---\n\n'), 'text')
            }
          } else {
            output(
              {
                contextEntries: result.contextEntries,
                specs: result.specs,
                warnings: result.warnings.map((w) => w.message),
              },
              fmt,
            )
          }
        } catch (err) {
          handleError(err, opts.format)
        }
      },
    )
}
