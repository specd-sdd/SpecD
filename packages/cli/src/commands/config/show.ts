import { type Command } from 'commander'
import { loadConfig } from '../../load-config.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'
import { type SpecdConfig } from '@specd/sdk'
import { renderConfigShapeHelp } from './config-shape.js'

/**
 * Renders a human-readable text summary of the config.
 *
 * @param config - The fully-resolved project config
 * @returns Lines of text output
 */
function renderText(config: SpecdConfig): string[] {
  const formatAdapter = (binding: { adapter: string; config: Record<string, unknown> }) => {
    return `[type: ${binding.adapter}]  config: ${JSON.stringify(binding.config)}`
  }

  const lines = [
    `projectRoot:  ${config.projectRoot}`,
    `specdPath:    ${config.specdPath ?? ''}`,
    `schemaRef:    ${config.schemaRef}`,
    `approvals:    spec=${String(config.approvals.spec)}  signoff=${String(config.approvals.signoff)}`,
    '',
    `workspaces:`,
    ...config.workspaces.map(
      (ws) => `  ${ws.name}  ${ws.ownership}  ${formatAdapter(ws.specsAdapter)}`,
    ),
    '',
    `storage:`,
    `  changes:   ${formatAdapter(config.storage.changesAdapter)}`,
    `  drafts:    ${formatAdapter(config.storage.draftsAdapter)}`,
    `  discarded: ${formatAdapter(config.storage.discardedAdapter)}`,
    `  archive:   ${formatAdapter(config.storage.archiveAdapter)}`,
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

  if (config.plugins !== undefined && config.plugins.length > 0) {
    lines.push('', 'plugins:')
    for (const plugin of config.plugins) {
      const contributions =
        plugin.contributions !== undefined && plugin.contributions.length > 0
          ? ` [contributions: ${plugin.contributions.join(', ')}]`
          : ''
      lines.push(`  ${plugin.name}  (present)${contributions}`)
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
    .description(
      'Display the fully resolved project configuration, showing all values after applying defaults and environment overrides.',
    )
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .addHelpText(
      'after',
      `
JSON/TOON output is the resolved SpecdConfig (all fields may be omitted when unset):
${renderConfigShapeHelp()}
Plugin names are scoped (@scope/name): ^@[a-z0-9][a-z0-9_-]*/[a-z0-9][a-z0-9_-]*$
`,
    )
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
