import { type Command } from 'commander'
import { type InvalidationPolicy } from '@specd/sdk'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'

/** A single file affected by invalidation, labelled with its expansion origin. */
type AffectedArtifactFile = {
  readonly artifactId: string
  readonly key: string
  readonly filename: string
  readonly expansion: 'direct' | 'downstream' | 'global'
}

/** Raw target input parsed from `--target` flags. */
type InvalidateTargetInput = { readonly artifactId: string; readonly specId?: string }

/**
 * Registers the `change invalidate` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerChangeInvalidate(parent: Command): void {
  parent
    .command('invalidate <name>')
    .allowExcessArguments(false)
    .description(
      'Invalidate a change and return it to designing, optionally targeting specific artifacts.',
    )
    .requiredOption('--reason <text>', 'mandatory explanation for the invalidation')
    .option(
      '--target <target>',
      'target an artifact or artifact@specId (repeatable)',
      (value: string, previous: string[]) => [...previous, value],
      [],
    )
    .option('--policy <policy>', 'override the change invalidation policy for this execution')
    .option('--force', 'bypass the approval/signoff guard')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .addHelpText(
      'after',
      `
Policies:
  none       No artifacts are reopened (change transitions to designing only)
  surgical   Only the explicitly targeted files are reopened
  downstream Targets plus all DAG descendants are reopened (default)
  global     Every artifact in the change is reopened

Target syntax:
  artifactId            Target all files in the artifact
  artifactId@specId     Target a specific file in a spec-scoped artifact
`,
    )
    .action(
      async (
        name: string,
        opts: {
          reason: string
          target: string[]
          policy?: string
          force?: boolean
          format: string
          config?: string
        },
      ) => {
        try {
          const { kernel } = await resolveCliContext({ configPath: opts.config })

          const targets = opts.target.map((t) => {
            const atIdx = t.indexOf('@')
            if (atIdx === -1) {
              return { artifactId: t }
            }
            return { artifactId: t.slice(0, atIdx), specId: t.slice(atIdx + 1) }
          })

          const input: {
            name: string
            reason: string
            targets?: readonly InvalidateTargetInput[]
            policyOverride?: InvalidationPolicy
            force?: boolean
          } = {
            name,
            reason: opts.reason,
            ...(opts.policy ? { policyOverride: opts.policy as InvalidationPolicy } : {}),
            ...(targets.length > 0 ? { targets } : {}),
            ...(opts.force !== undefined ? { force: opts.force } : {}),
          }

          const result = await kernel.changes.invalidate.execute(input)

          const fmt = parseFormat(opts.format)

          if (fmt === 'text') {
            const lines: string[] = []
            lines.push(`change:      ${result.change.name}`)
            lines.push(`state:       ${result.change.state}`)
            lines.push(`policy:      ${result.effectivePolicy}`)

            if (result.effectivePolicy === 'none') {
              lines.push('')
              lines.push(
                'No artifacts were invalidated because the effective invalidation policy is "none".',
              )
              lines.push(
                'Use --policy <policy> to force a different propagation policy for this execution.',
              )
            } else if (result.affected.length === 0) {
              lines.push('')
              lines.push('No artifacts were affected.')
            } else {
              lines.push('')
              lines.push('affected:')
              const byArtifact = new Map<string, AffectedArtifactFile[]>()
              for (const entry of result.affected) {
                let list = byArtifact.get(entry.artifactId)
                if (list === undefined) {
                  list = []
                  byArtifact.set(entry.artifactId, list)
                }
                list.push(entry)
              }
              const artifactOrder = result.affected.map((e) => e.artifactId)
              const seenArtifacts = new Set<string>()
              const orderedKeys = artifactOrder.filter((id) => {
                if (seenArtifacts.has(id)) return false
                seenArtifacts.add(id)
                return true
              })
              for (const artifactId of orderedKeys) {
                const entries = byArtifact.get(artifactId)!
                lines.push(`  ${artifactId}:`)
                for (const entry of entries) {
                  const expansionLabel =
                    entry.expansion !== 'direct' ? `  (${entry.expansion})` : ''
                  lines.push(`    - ${entry.key}  ${entry.filename}${expansionLabel}`)
                }
              }
            }

            output(lines.join('\n'), 'text')
          } else {
            output(
              {
                name: result.change.name,
                state: result.change.state,
                effectivePolicy: result.effectivePolicy,
                affected: result.affected,
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
