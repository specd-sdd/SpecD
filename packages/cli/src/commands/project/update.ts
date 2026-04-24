import { type Command } from 'commander'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'
import { updatePluginsWithKernel } from '../plugins/update.js'

/**
 * Registers the `project update` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerProjectUpdate(parent: Command): void {
  parent
    .command('update')
    .allowExcessArguments(false)
    .description(
      'Update project-managed assets to match the currently declared plugin set in specd.yaml.',
    )
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  {
    plugins: Array<{ name: string, status: "updated" | "skipped" | "error", detail: string }>
  }
`,
    )
    .action(async (opts: { format: string; config?: string }) => {
      try {
        const fmt = parseFormat(opts.format)
        const { config, configFilePath, kernel } = await resolveCliContext({
          configPath: opts.config,
        })
        const configPath = configFilePath ?? `${config.projectRoot}/specd.yaml`
        const result = await updatePluginsWithKernel({
          kernel,
          config,
          configPath,
        })

        if (result.plugins.length === 0) {
          if (fmt === 'text') {
            output('project is up to date', 'text')
          } else {
            output({ plugins: [] }, fmt)
          }
          return
        }

        if (fmt === 'text') {
          for (const plugin of result.plugins) {
            if (plugin.status === 'updated') {
              output(`plugins: updated ${plugin.name}`, 'text')
            } else {
              output(`plugins: ${plugin.status} ${plugin.name} (${plugin.detail})`, 'text')
            }
          }
        } else {
          output({ plugins: result.plugins }, fmt)
        }

        if (result.hasErrors) {
          process.exit(1)
        }
      } catch (err) {
        handleError(err, opts.format)
      }
    })
}
