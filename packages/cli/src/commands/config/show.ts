import { type Command } from 'commander'
import { loadConfig } from '../../load-config.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'
import { type SpecdConfig } from '@specd/core'

/**
 * Renders a human-readable text summary of the config.
 *
 * @param config - The fully-resolved project config
 * @returns Lines of text output
 */
function renderText(config: SpecdConfig): string[] {
  const lines = [
    `projectRoot:  ${config.projectRoot}`,
    `schemaRef:    ${config.schemaRef}`,
    `approvals:    spec=${String(config.approvals.spec)}  signoff=${String(config.approvals.signoff)}`,
    '',
    `workspaces:`,
    ...config.workspaces.map((ws) => `  ${ws.name}  ${ws.ownership}  ${ws.specsPath}`),
    '',
    `storage:`,
    `  changes:   ${config.storage.changesPath}`,
    `  drafts:    ${config.storage.draftsPath}`,
    `  discarded: ${config.storage.discardedPath}`,
    `  archive:   ${config.storage.archivePath}`,
  ]

  if (config.storage.archivePattern !== undefined) {
    lines.push(`  pattern:   ${config.storage.archivePattern}`)
  }

  if (config.context !== undefined && config.context.length > 0) {
    lines.push('', 'context:')
    for (const entry of config.context) {
      if ('file' in entry) lines.push(`  file: ${entry.file}`)
      else lines.push(`  instruction: ${entry.instruction}`)
    }
  }

  if (config.contextIncludeSpecs !== undefined) {
    lines.push('', `contextIncludeSpecs: ${config.contextIncludeSpecs.join(', ')}`)
  }
  if (config.contextExcludeSpecs !== undefined) {
    lines.push(`contextExcludeSpecs: ${config.contextExcludeSpecs.join(', ')}`)
  }
  if (config.llmOptimizedContext !== undefined) {
    lines.push(`llmOptimizedContext: ${String(config.llmOptimizedContext)}`)
  }
  if (config.schemaPlugins !== undefined) {
    lines.push('', `schemaPlugins: ${config.schemaPlugins.join(', ')}`)
  }

  if (config.workflow !== undefined && config.workflow.length > 0) {
    lines.push('', 'workflow:')
    for (const step of config.workflow) {
      const pre = step.hooks.pre.length
      const post = step.hooks.post.length
      lines.push(`  ${step.step}  pre: ${pre} hooks  post: ${post} hooks`)
    }
  }

  if (config.artifactRules !== undefined) {
    lines.push('', 'artifactRules:')
    for (const [id, rules] of Object.entries(config.artifactRules)) {
      lines.push(`  ${id}: ${rules.length} rules`)
    }
  }

  if (config.schemaOverrides !== undefined) {
    lines.push('', 'schemaOverrides: (present)')
  }

  return lines
}

/**
 * Registers the `config show` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerConfigShow(parent: Command): void {
  parent
    .command('show')
    .allowExcessArguments(false)
    .description('Show the resolved project configuration')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (opts: { format: string; config?: string }) => {
      try {
        const config = await loadConfig({ configPath: opts.config })
        const fmt = parseFormat(opts.format)

        if (fmt === 'text') {
          output(renderText(config).join('\n'), 'text')
        } else {
          output(config, fmt)
        }
      } catch (err) {
        handleError(err, opts.format)
      }
    })
}
