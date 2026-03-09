import { type Command } from 'commander'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { createCliKernel } from '../../kernel.js'
import { loadConfig } from '../../load-config.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'
import { findChangeDir } from '../../helpers/change-dir.js'
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

        const changeDir = await findChangeDir(config.storage.changesPath, name)
        const resolvedChangeDir = changeDir ?? path.join(config.storage.changesPath, name)

        // Resolve schema for delta info
        let schemaArtifacts: ReadonlyMap<string, { delta: boolean; output: string }> = new Map()
        try {
          const workspaceSchemasPaths = buildWorkspaceSchemasPaths(config)
          const schema = await kernel.specs.getActiveSchema.execute({
            schemaRef: config.schemaRef,
            workspaceSchemasPaths,
          })
          schemaArtifacts = new Map(
            schema.artifacts().map((a) => [a.id, { delta: a.delta, output: a.output }]),
          )
        } catch {
          // If schema resolution fails, skip delta entries
        }

        /** Shape of a single artifact row for display. */
        type ArtifactRow = {
          id: string
          filename: string
          path: string
          effectiveStatus: string
          exists: boolean
        }

        const artifactRows: ArtifactRow[] = []

        for (const a of artifactStatuses) {
          const artifact = change.artifacts.get(a.type)
          const schemaArtifact = schemaArtifacts.get(a.type)
          const filename = artifact?.filename ?? schemaArtifact?.output ?? `${a.type}.md`
          const absPath = path.join(resolvedChangeDir, filename)
          let exists = false
          try {
            await fs.stat(absPath)
            exists = true
          } catch {
            exists = false
          }
          artifactRows.push({
            id: a.type,
            filename,
            path: absPath,
            effectiveStatus: a.effectiveStatus,
            exists,
          })

          // Add delta entries when schema declares delta: true
          if (schemaArtifact?.delta) {
            for (const specId of change.specIds) {
              const deltaFilename = `${filename.replace(/\.[^.]+$/, '')}.delta.yaml`
              const deltaPath = path.join(resolvedChangeDir, 'deltas', specId, deltaFilename)
              let deltaExists = false
              try {
                await fs.stat(deltaPath)
                deltaExists = true
              } catch {
                deltaExists = false
              }
              artifactRows.push({
                id: `${a.type}.delta`,
                filename: deltaFilename,
                path: deltaPath,
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
              pad(r.exists ? 'yes' : 'no', maxExists) +
              '  ' +
              r.path,
          )
          output(lines.join('\n'), 'text')
        } else {
          output(
            {
              name,
              changeDir: resolvedChangeDir,
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
