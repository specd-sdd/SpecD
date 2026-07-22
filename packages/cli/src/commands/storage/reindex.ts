import { type Command } from 'commander'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'

/** Result payload for storage reindex JSON/toon output. */
interface StorageReindexResult {
  reindexed: {
    changes?: true
    specs?: string[]
    archive?: true
  }
}

/**
 * Registers the `storage reindex` subcommand on the given parent command.
 *
 * @param parent - Storage command group
 */
export function registerStorageReindex(parent: Command): void {
  parent
    .command('reindex')
    .allowExcessArguments(false)
    .description(
      'Rebuild filesystem list indexes under configPath/tmp/fs-cache (changes, specs, archive).',
    )
    .option('--changes', 'rebuild active, draft, and discarded change indexes')
    .option('--specs', 'rebuild spec indexes for every configured workspace')
    .option('--archive', 'rebuild the archive list index')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(
      async (opts: {
        changes?: boolean
        specs?: boolean
        archive?: boolean
        format: string
        config?: string
      }) => {
        try {
          const { kernel } = await resolveCliContext({ configPath: opts.config })
          const rebuildAll = !opts.changes && !opts.specs && !opts.archive
          const rebuildChanges = rebuildAll || opts.changes === true
          const rebuildSpecs = rebuildAll || opts.specs === true
          const rebuildArchive = rebuildAll || opts.archive === true

          const result: StorageReindexResult = { reindexed: {} }
          const textLines: string[] = []

          if (rebuildChanges) {
            await kernel.changes.repo.reindex()
            result.reindexed = { ...result.reindexed, changes: true }
            textLines.push('reindexed changes')
          }

          if (rebuildSpecs) {
            const workspaces = await kernel.project.listWorkspaces.execute()
            const specWorkspaces: string[] = []
            for (const ws of workspaces) {
              await ws.specRepo.reindex()
              specWorkspaces.push(ws.name)
              textLines.push(`reindexed specs (${ws.name})`)
            }
            result.reindexed = { ...result.reindexed, specs: specWorkspaces }
          }

          if (rebuildArchive) {
            await kernel.changes.archiveRepo.reindex()
            result.reindexed = { ...result.reindexed, archive: true }
            textLines.push('reindexed archive')
          }

          const fmt = parseFormat(opts.format)
          if (fmt === 'text') {
            output(textLines.join('\n'), 'text')
          } else {
            output(result, fmt)
          }
        } catch (err) {
          handleError(err, opts.format)
        }
      },
    )
}
