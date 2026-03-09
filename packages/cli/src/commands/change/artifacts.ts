import { type Command } from 'commander'
import { createCliKernel } from '../../kernel.js'
import { loadConfig } from '../../load-config.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'
import { buildWorkspaceSchemasPaths } from '../../helpers/workspace-map.js'
import { vlen, pad } from '../../helpers/table.js'

/**
 * Registers the `change artifacts` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerChangeArtifacts(parent: Command): void {
  parent
    .command('artifacts <name>')
    .description('Show artifact files for a change')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (name: string, opts: { format: string; config?: string }) => {
      try {
        const config = await loadConfig({ configPath: opts.config })
        const kernel = createCliKernel(config)
        const { change, artifactStatuses } = await kernel.changes.status.execute({ name })

        // Resolve schema for delta info
        let schemaArtifacts: ReadonlyMap<string, { delta: boolean; output: string }> = new Map()
        try {
          const workspaceSchemasPaths = buildWorkspaceSchemasPaths(config)
          const schema = await kernel.specs.getActiveSchema.execute({
            schemaRef: config.schemaRef,
            workspaceSchemasPaths,
          })
          schemaArtifacts = new Map(
            schema
              .artifacts()
              .map((a: { id: string; delta: boolean; output: string }) => [
                a.id,
                { delta: a.delta, output: a.output },
              ]),
          )
        } catch {
          // If schema resolution fails, skip delta entries
        }

        /** Shape of a single artifact row for display. */
        type ArtifactRow = {
          id: string
          filename: string
          effectiveStatus: string
          exists: boolean
        }

        const artifactRows: ArtifactRow[] = []

        for (const a of artifactStatuses) {
          const artifact = change.artifacts.get(a.type)
          const schemaArtifact = schemaArtifacts.get(a.type)
          const filename = artifact?.filename ?? schemaArtifact?.output ?? `${a.type}.md`
          const exists = await kernel.changes.repo.artifactExists(change, filename)
          artifactRows.push({
            id: a.type,
            filename,
            effectiveStatus: a.effectiveStatus,
            exists,
          })

          // Add delta entries when schema declares delta: true
          if (schemaArtifact?.delta) {
            for (const specId of change.specIds) {
              const deltaFilename = `${filename.replace(/\.[^.]+$/, '')}.delta.yaml`
              const deltaExists = await kernel.changes.repo.deltaExists(
                change,
                specId,
                deltaFilename,
              )
              artifactRows.push({
                id: `${a.type}.delta`,
                filename: deltaFilename,
                effectiveStatus: deltaExists ? 'complete' : 'missing',
                exists: deltaExists,
              })
            }
          }
        }

        const fmt = parseFormat(opts.format)
        if (fmt === 'text') {
          const maxId = Math.max(vlen(''), ...artifactRows.map((r) => vlen(r.id)))
          const maxStatus = Math.max(vlen(''), ...artifactRows.map((r) => vlen(r.effectiveStatus)))
          const maxExists = vlen('no')
          const lines = artifactRows.map(
            (r) =>
              pad(r.id, maxId) +
              '  ' +
              pad(r.effectiveStatus, maxStatus) +
              '  ' +
              pad(r.exists ? 'yes' : 'no', maxExists),
          )
          output(lines.join('\n'), 'text')
        } else {
          output(
            {
              name,
              artifacts: artifactRows,
            },
            fmt,
          )
        }
      } catch (err) {
        handleError(err)
      }
    })
}
