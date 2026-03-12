import { type Command } from 'commander'
import { loadConfig } from '../../load-config.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'

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
          output(lines.join('\n'), 'text')
        } else {
          output(
            {
              projectRoot: config.projectRoot,
              schemaRef: config.schemaRef,
              workspaces: config.workspaces.map((ws) => ({
                name: ws.name,
                specsPath: ws.specsPath,
                ownership: ws.ownership,
                isExternal: ws.isExternal,
              })),
              storage: {
                changesPath: config.storage.changesPath,
                draftsPath: config.storage.draftsPath,
                discardedPath: config.storage.discardedPath,
                archivePath: config.storage.archivePath,
              },
              approvals: config.approvals,
            },
            fmt,
          )
        }
      } catch (err) {
        handleError(err, opts.format)
      }
    })
}
