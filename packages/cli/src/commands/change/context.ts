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
    .description(
      'Compile and print the full context block for a change, including relevant specs, rules, and constraints for the current lifecycle step.',
    )
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
    .option('--fingerprint <hash>', 'skip if context unchanged')
    .option('--config <path>', 'path to specd.yaml')
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  {
    contextFingerprint: string
    status: 'changed' | 'unchanged'
    stepAvailable: boolean
    blockingArtifacts: string[]
    projectContext: ProjectContextEntry[]
    specs: ContextSpecEntry[]
    availableSteps: AvailableStep[]
    warnings: string[]
  }

When status is 'unchanged', only contextFingerprint and status are returned.
`,
    )
    .action(
      async (
        name: string,
        step: string,
        opts: {
          rules?: boolean
          constraints?: boolean
          scenarios?: boolean
          followDeps?: boolean
          depth?: number
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
            ...(config.contextIncludeSpecs !== undefined
              ? { contextIncludeSpecs: [...config.contextIncludeSpecs] }
              : {}),
            ...(config.contextExcludeSpecs !== undefined
              ? { contextExcludeSpecs: [...config.contextExcludeSpecs] }
              : {}),
            ...(config.contextMode !== undefined ? { contextMode: config.contextMode } : {}),
            ...(Object.keys(workspacesConfig).length > 0 ? { workspaces: workspacesConfig } : {}),
          }

          const sectionFlags: SpecSection[] = []
          if (opts.rules) sectionFlags.push('rules')
          if (opts.constraints) sectionFlags.push('constraints')
          if (opts.scenarios) sectionFlags.push('scenarios')

          const result = await kernel.changes.compile.execute({
            name,
            step,
            config: compileConfig,
            ...(opts.followDeps ? { followDeps: true } : {}),
            ...(opts.depth !== undefined ? { depth: opts.depth } : {}),
            ...(sectionFlags.length > 0 ? { sections: sectionFlags } : {}),
            ...(opts.fingerprint !== undefined ? { fingerprint: opts.fingerprint } : {}),
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
          if (result.status === 'unchanged') {
            if (fmt === 'text') {
              output('Context unchanged since last call.', 'text')
            } else {
              output(
                {
                  contextFingerprint: result.contextFingerprint,
                  status: result.status,
                  stepAvailable: result.stepAvailable,
                  blockingArtifacts: result.blockingArtifacts,
                  availableSteps: result.availableSteps,
                  warnings: result.warnings.map((w) => w.message),
                },
                fmt,
              )
            }
            return
          }

          if (fmt === 'text') {
            const parts: string[] = []

            // Project context entries
            for (const entry of result.projectContext) {
              if (entry.source === 'file' && entry.path !== undefined) {
                parts.push(`**Source: ${entry.path}**\n\n${entry.content}`)
              } else {
                parts.push(`**Source: instruction**\n\n${entry.content}`)
              }
            }

            // Full-mode specs
            const fullSpecs = result.specs.filter((s) => s.mode === 'full')
            if (fullSpecs.length > 0) {
              const specParts = fullSpecs.map((s) => `### Spec: ${s.specId}\n\n${s.content ?? ''}`)
              parts.push(`## Spec content\n\n${specParts.join('\n\n---\n\n')}`)
            }

            // Summary-mode specs (catalogue)
            const summarySpecs = result.specs.filter((s) => s.mode === 'summary')
            if (summarySpecs.length > 0) {
              const includePatternSpecs = summarySpecs.filter(
                (s) => s.source !== 'dependsOnTraversal',
              )
              const depTraversalSpecs = summarySpecs.filter(
                (s) => s.source === 'dependsOnTraversal',
              )

              const catalogueParts: string[] = [
                'Use `specd spec show <spec-id>` to load the full content of any spec you need.',
                '',
              ]

              if (includePatternSpecs.length > 0) {
                catalogueParts.push('| Spec ID | Title | Description |')
                catalogueParts.push('|---------|-------|-------------|')
                for (const s of includePatternSpecs) {
                  catalogueParts.push(`| ${s.specId} | ${s.title} | ${s.description} |`)
                }
              }

              if (depTraversalSpecs.length > 0) {
                catalogueParts.push('')
                catalogueParts.push('### Via dependencies')
                catalogueParts.push('')
                catalogueParts.push('| Spec ID | Title | Description |')
                catalogueParts.push('|---------|-------|-------------|')
                for (const s of depTraversalSpecs) {
                  catalogueParts.push(`| ${s.specId} | ${s.title} | ${s.description} |`)
                }
              }

              parts.push(`## Available context specs\n\n${catalogueParts.join('\n')}`)
            }

            // Available steps
            if (result.availableSteps.length > 0) {
              const stepLines = result.availableSteps.map((s) =>
                s.available
                  ? `- ${s.step}: available`
                  : `- ${s.step}: unavailable — requires: [${s.blockingArtifacts.join(', ')}]`,
              )
              parts.push(`## Available steps\n\n${stepLines.join('\n')}`)
            }

            output(parts.join('\n\n---\n\n'), 'text')
          } else {
            output(
              {
                contextFingerprint: result.contextFingerprint,
                status: result.status,
                stepAvailable: result.stepAvailable,
                blockingArtifacts: result.blockingArtifacts,
                projectContext: result.projectContext,
                specs: result.specs,
                availableSteps: result.availableSteps,
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
