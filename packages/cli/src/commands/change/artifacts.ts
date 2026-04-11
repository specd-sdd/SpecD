import { type Command } from 'commander'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'
import { vlen, pad } from '../../helpers/table.js'

/**
 * Registers the `change artifacts` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerChangeArtifacts(parent: Command): void {
  parent
    .command('artifacts <name>')
    .allowExcessArguments(false)
    .description(
      'List all artifacts and their current statuses (present, missing, skipped) for a named change.',
    )
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  {
    name: string
    changeDir: string
    artifacts: Array<{
      kind: string
      id: string
      artifactState: string
      fileState: string
      filename: string
      path: string
      exists: boolean
    }>
  }
`,
    )
    .action(async (name: string, opts: { format: string; config?: string }) => {
      try {
        const { kernel } = await resolveCliContext({ configPath: opts.config })
        const { change, artifactStatuses, lifecycle } = await kernel.changes.status.execute({
          name,
        })
        const changeDir =
          typeof kernel.changes.repo.changePath === 'function'
            ? kernel.changes.repo.changePath(change)
            : (lifecycle?.changePath ?? '')

        // Resolve schema for delta info
        let schemaArtifacts: ReadonlyMap<string, { delta: boolean; output: string }> = new Map()
        try {
          const result = await kernel.specs.getActiveSchema.execute()
          if (result.raw) throw new Error('Unexpected raw result')
          schemaArtifacts = new Map(
            result.schema
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
          kind: 'artifact-file' | 'delta'
          id: string
          artifactState: string
          fileState: string
          filename: string
          path: string
          exists: boolean
        }

        const artifactRows: ArtifactRow[] = []

        for (const a of artifactStatuses) {
          const schemaArtifact = schemaArtifacts.get(a.type)
          const artifactState = a.state
          const files = a.files

          // Show per-file rows from the new multi-file model
          for (const file of files) {
            const exists = await kernel.changes.repo.artifactExists(change, file.filename)
            artifactRows.push({
              kind: 'artifact-file',
              id: files.length > 1 ? `${a.type} [${file.key}]` : a.type,
              artifactState,
              fileState: file.state,
              filename: file.filename,
              path: `${changeDir}/${file.filename}`,
              exists,
            })
          }

          // If no files exist yet, show a summary row
          if (files.length === 0) {
            const filename = schemaArtifact?.output ?? `${a.type}.md`
            artifactRows.push({
              kind: 'artifact-file',
              id: a.type,
              artifactState,
              fileState: artifactState,
              filename,
              path: `${changeDir}/${filename}`,
              exists: false,
            })
          }

          // Add delta entries when schema declares delta: true
          if (schemaArtifact?.delta) {
            const emitsPersistedDeltaFiles = files.some((file) =>
              file.filename.endsWith('.delta.yaml'),
            )
            if (emitsPersistedDeltaFiles) continue
            const baseFilename = files[0]?.filename ?? schemaArtifact.output
            for (const specId of change.specIds) {
              const deltaFilename = `${baseFilename.replace(/\.[^.]+$/, '')}.delta.yaml`
              const deltaExists = await kernel.changes.repo.deltaExists(
                change,
                specId,
                deltaFilename,
              )
              artifactRows.push({
                kind: 'delta',
                id: `${a.type}.delta`,
                artifactState,
                fileState: deltaExists ? 'in-progress' : 'missing',
                filename: deltaFilename,
                path: `${changeDir}/deltas/${specId}/${deltaFilename}`,
                exists: deltaExists,
              })
            }
          }
        }

        const fmt = parseFormat(opts.format)
        if (fmt === 'text') {
          const maxId = Math.max(vlen(''), ...artifactRows.map((r) => vlen(r.id)))
          const maxArtifact = Math.max(vlen(''), ...artifactRows.map((r) => vlen(r.artifactState)))
          const maxFile = Math.max(vlen(''), ...artifactRows.map((r) => vlen(r.fileState)))
          const maxExists = vlen('no')
          const lines = artifactRows.map(
            (r) =>
              pad(r.id, maxId) +
              '  ' +
              pad(r.artifactState, maxArtifact) +
              '  ' +
              pad(r.fileState, maxFile) +
              '  ' +
              pad(r.exists ? 'yes' : 'no', maxExists),
          )
          output(lines.join('\n'), 'text')
        } else {
          output(
            {
              name,
              changeDir,
              artifacts: artifactRows,
            },
            fmt,
          )
        }
      } catch (err) {
        handleError(err, opts.format)
      }
    })
}
