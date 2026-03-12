import { type Command } from 'commander'
import { type CompileContextConfig, type SpecSection } from '@specd/core'
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
    .description('Compile the instruction context for a lifecycle step')
    .option('--artifact <id>', 'the active artifact ID (for designing step)')
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
      async (
        name: string,
        step: string,
        opts: {
          artifact?: string
          rules?: boolean
          constraints?: boolean
          scenarios?: boolean
          followDeps?: boolean
          depth?: number
          format: string
          config?: string
        },
      ) => {
        try {
          if (opts.depth !== undefined && !opts.followDeps) {
            cliError('--depth requires --follow-deps', opts.format)
          }

          const { config, kernel } = await resolveCliContext({ configPath: opts.config })
          /**
           * Context filter settings for a single workspace.
           *
           * @remarks Used when building the CompileContextConfig from specd.yaml workspace entries.
           */
          type WorkspaceCtx = { contextIncludeSpecs?: string[]; contextExcludeSpecs?: string[] }
          const workspacesConfig: Record<string, WorkspaceCtx> = {}
          for (const ws of config.workspaces) {
            if (ws.contextIncludeSpecs !== undefined || ws.contextExcludeSpecs !== undefined) {
              const entry: WorkspaceCtx = {}
              if (ws.contextIncludeSpecs !== undefined)
                entry.contextIncludeSpecs = [...ws.contextIncludeSpecs]
              if (ws.contextExcludeSpecs !== undefined)
                entry.contextExcludeSpecs = [...ws.contextExcludeSpecs]
              workspacesConfig[ws.name] = entry
            }
          }

          const compileConfig: CompileContextConfig = {
            ...(config.context !== undefined
              ? {
                  context: config.context.map((e) =>
                    'file' in e ? { file: e.file } : { instruction: e.instruction },
                  ),
                }
              : {}),
            ...(config.artifactRules !== undefined
              ? {
                  artifactRules: Object.fromEntries(
                    Object.entries(config.artifactRules).map(([k, v]) => [k, [...v]]),
                  ),
                }
              : {}),
            ...(config.contextIncludeSpecs !== undefined
              ? { contextIncludeSpecs: [...config.contextIncludeSpecs] }
              : {}),
            ...(config.contextExcludeSpecs !== undefined
              ? { contextExcludeSpecs: [...config.contextExcludeSpecs] }
              : {}),
            ...(Object.keys(workspacesConfig).length > 0 ? { workspaces: workspacesConfig } : {}),
          }

          const sectionFlags: SpecSection[] = []
          if (opts.rules) sectionFlags.push('rules')
          if (opts.constraints) sectionFlags.push('constraints')
          if (opts.scenarios) sectionFlags.push('scenarios')

          const result = await kernel.changes.compile.execute({
            name,
            step,
            ...(opts.artifact !== undefined ? { activeArtifact: opts.artifact } : {}),
            config: compileConfig,
            ...(opts.followDeps ? { followDeps: true } : {}),
            ...(opts.depth !== undefined ? { depth: opts.depth } : {}),
            ...(sectionFlags.length > 0 ? { sections: sectionFlags } : {}),
          })

          if (!result.stepAvailable && result.blockingArtifacts.length > 0) {
            process.stderr.write(
              `warning: step '${step}' is not yet available; blocking artifacts: ${result.blockingArtifacts.join(', ')}\n`,
            )
          }

          for (const w of result.warnings) {
            process.stderr.write(`warning: ${w.message}\n`)
          }

          const fmt = parseFormat(opts.format)
          if (fmt === 'text') {
            output(result.instructionBlock, 'text')
          } else {
            output(
              {
                instructionBlock: result.instructionBlock,
                stepAvailable: result.stepAvailable,
                blockingArtifacts: result.blockingArtifacts,
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
