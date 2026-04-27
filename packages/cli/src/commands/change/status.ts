import { type Command } from 'commander'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'
import { type ArtifactStatusEntry, type ArtifactType } from '@specd/core'

/**
 * Registers the `change status` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerChangeStatus(parent: Command): void {
  parent
    .command('status <name>')
    .allowExcessArguments(false)
    .description(
      'Display the current state, artifact statuses, lifecycle transitions, and blockers for a named change.',
    )
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  {
    name: string
    state: string
    specIds: string[]
    schema: { name: string, version: number }
    description?: string
    blockers: Array<{ code: string, message: string }>
    nextAction: { targetStep: string, actionType: string, reason: string, command: string | null }
    artifactDag: Array<{ id: string, scope: string, state: string, requires: string[], children: string[] }>
    artifacts: Array<{
      type: string
      state: string
      effectiveStatus: string
      files: Array<{ key: string, filename: string, state: string, validatedHash?: string }>
    }>
    review: {
      required: boolean
      route: string | null
      reason: string | null
      affectedArtifacts: Array<{
        type: string
        files: Array<{ key: string, filename: string, path: string }>
      }>
    }
  }
`,
    )
    .action(async (name: string, opts: { format: string; config?: string }) => {
      try {
        const { kernel } = await resolveCliContext({ configPath: opts.config })
        const statusResult = await kernel.changes.status.execute({
          name,
        })

        const { change, artifactStatuses, lifecycle, review, blockers, nextAction } = statusResult

        // Schema version warning
        if (lifecycle.schemaInfo !== null) {
          const recorded = `${change.schemaName}@${change.schemaVersion}`
          const current = `${lifecycle.schemaInfo.name}@${lifecycle.schemaInfo.version}`
          if (recorded !== current) {
            process.stderr.write(
              `warning: change was created with schema ${recorded} but active schema is ${current}\n`,
            )
          }
        }

        const fmt = parseFormat(opts.format)

        if (fmt === 'text') {
          const lines = [
            `change:      ${change.name}`,
            `state:       ${change.state}`,
            `specs:       ${[...change.specIds].join(', ') || '(none)'}`,
          ]
          if (change.description !== undefined) {
            lines.push(`description: ${change.description}`)
          }
          lines.push('')

          // Artifact DAG Section
          if (lifecycle.schemaInfo !== null) {
            lines.push('artifacts (DAG):')
            lines.push(
              '  [✓] complete  [ ] missing  [!] drifted  [~] needs review  [?] in-progress',
            )
            lines.push('')
            lines.push(...renderDag(lifecycle.schemaInfo.artifacts, artifactStatuses))
            lines.push('')
          }

          // Blockers Section
          if (blockers.length > 0) {
            lines.push('blockers:')
            for (const b of blockers) {
              lines.push(`  ! ${b.code}: ${b.message}`)
            }
            lines.push('')
          }

          // Next Action Section
          lines.push('next action:')
          lines.push(`  target:  ${nextAction.targetStep}`)
          lines.push(`  command: ${nextAction.command ?? '(none)'}`)
          lines.push(`  reason:  ${nextAction.reason}`)
          lines.push('')

          // Lifecycle Section
          lines.push('lifecycle:')
          if (lifecycle.availableTransitions.length > 0) {
            lines.push(`  transitions:  ${lifecycle.availableTransitions.join(', ')}`)
          }
          if (lifecycle.nextArtifact !== null) {
            lines.push(`  next artifact: ${lifecycle.nextArtifact}`)
          }
          const specGate = lifecycle.approvals.spec ? 'on' : 'off'
          const signoffGate = lifecycle.approvals.signoff ? 'on' : 'off'
          lines.push(`  approvals:     spec=${specGate}  signoff=${signoffGate}`)
          lines.push(`  path:          ${lifecycle.changePath}`)

          if (review?.required === true) {
            lines.push('')
            lines.push('review:')
            lines.push(`  required: yes`)
            lines.push(`  route:    ${review.route}`)
            lines.push(`  reason:   ${review.reason}`)
            if (review.reason === 'spec-overlap-conflict' && review.overlapDetail.length > 0) {
              lines.push('  overlap:')
              for (const entry of review.overlapDetail) {
                lines.push(
                  `    - archived: ${entry.archivedChangeName}, specs: ${entry.overlappingSpecIds.join(', ')}`,
                )
              }
            }
            for (const artifact of review.affectedArtifacts) {
              lines.push(`  ${artifact.type}:`)
              for (const file of artifact.files) {
                lines.push(`    - ${file.path}`)
              }
            }
          }

          lines.push('')
          lines.push('artifacts (details):')
          for (const a of artifactStatuses) {
            lines.push(`  ${a.type}  ${a.state}  (effective: ${a.effectiveStatus})`)
            for (const file of a.files) {
              const hash = file.validatedHash !== undefined ? `  ${file.validatedHash}` : ''
              lines.push(`    - ${file.key}  ${file.state}  ${file.filename}${hash}`)
            }
          }

          output(lines.join('\n'), 'text')
        } else {
          output(
            {
              name: change.name,
              state: change.state,
              specIds: [...change.specIds],
              schema: { name: change.schemaName, version: change.schemaVersion },
              ...(change.description !== undefined ? { description: change.description } : {}),
              blockers: blockers.map((b) => ({ code: b.code, message: b.message })),
              nextAction: {
                targetStep: nextAction.targetStep,
                actionType: nextAction.actionType,
                reason: nextAction.reason,
                command: nextAction.command,
              },
              artifactDag:
                lifecycle.schemaInfo?.artifacts.map((a) => ({
                  id: a.id,
                  scope: a.scope,
                  state:
                    artifactStatuses.find((as) => as.type === a.id)?.effectiveStatus ?? 'missing',
                  requires: a.requires ?? [],
                  children:
                    lifecycle.schemaInfo?.artifacts
                      .filter((child) => child.requires.includes(a.id))
                      .map((child) => child.id) ?? [],
                })) ?? [],
              artifacts: artifactStatuses.map((a) => ({
                type: a.type,
                state: a.state,
                effectiveStatus: a.effectiveStatus,
                files: a.files.map((file) => ({
                  key: file.key,
                  filename: file.filename,
                  state: file.state,
                  ...(file.validatedHash !== undefined
                    ? { validatedHash: file.validatedHash }
                    : {}),
                })),
              })),
              review: {
                required: review?.required ?? false,
                route: review?.route ?? null,
                reason: review?.reason ?? null,
                overlapDetail: review?.overlapDetail ?? [],
                affectedArtifacts: (review?.affectedArtifacts ?? []).map((artifact) => ({
                  type: artifact.type,
                  files: artifact.files.map((file) => ({
                    key: file.key,
                    filename: file.filename,
                    path: file.path,
                  })),
                })),
              },
              lifecycle: {
                validTransitions: [...lifecycle.validTransitions],
                availableTransitions: [...lifecycle.availableTransitions],
                blockers: lifecycle.blockers.map((b) => ({
                  transition: b.transition,
                  reason: b.reason,
                  blocking: [...b.blocking],
                })),
                approvals: lifecycle.approvals,
                nextArtifact: lifecycle.nextArtifact,
                changePath: lifecycle.changePath,
                schemaInfo:
                  lifecycle.schemaInfo !== null
                    ? { name: lifecycle.schemaInfo.name, version: lifecycle.schemaInfo.version }
                    : null,
              },
              ...(lifecycle.schemaInfo !== null
                ? {
                    schema: {
                      name: lifecycle.schemaInfo.name,
                      version: lifecycle.schemaInfo.version,
                      artifactDag:
                        lifecycle.schemaInfo.artifacts?.map((a) => ({
                          id: a.id,
                          scope: a.scope,
                          optional: a.optional ?? false,
                          requires: a.requires ?? [],
                          hasTaskCompletionCheck: a.taskCompletionCheck !== undefined,
                          output: a.output,
                        })) ?? [],
                    },
                  }
                : {}),
              approvalGates: {
                specEnabled: lifecycle.approvals.spec,
                signoffEnabled: lifecycle.approvals.signoff,
              },
            },
            fmt,
          )
        }
      } catch (err) {
        handleError(err, opts.format)
      }
    })
}

/**
 * Renders the artifact dependency graph as an ASCII tree.
 *
 * @param artifactTypes - All artifact types defined in the schema
 * @param artifactStatuses - Current statuses for all artifacts in the change
 * @returns Array of formatted lines representing the tree
 */
function renderDag(
  artifactTypes: readonly ArtifactType[],
  artifactStatuses: ArtifactStatusEntry[],
): string[] {
  const rootIds = artifactTypes
    .filter((a) => !a.requires || a.requires.length === 0)
    .map((a) => a.id)
  const lines: string[] = []

  const stateSymbols: Record<string, string> = {
    complete: '[✓]',
    skipped: '[✓]',
    missing: '[ ]',
    'drifted-pending-review': '[!]',
    'pending-review': '[~]',
    'pending-parent-artifact-review': '[~]',
    'in-progress': '[?]',
  }

  /**
   * Draws a single node and recursively its children.
   *
   * @param id - The artifact type ID to draw
   * @param prefix - Indentation prefix for the line
   * @param isRoot - Whether this is a root node
   * @param isLast - Whether this is the last child of its parent
   */
  function drawNode(id: string, prefix: string, isRoot: boolean, isLast: boolean): void {
    const artifact = artifactTypes.find((a) => a.id === id)
    if (!artifact) return

    const status = artifactStatuses.find((as) => as.type === id)?.effectiveStatus ?? 'missing'
    const symbol = stateSymbols[status] ?? '[?]'
    const scope = `[scope: ${artifact.scope}]`

    const connector = isRoot ? '' : isLast ? '└── ' : '├── '
    lines.push(`${prefix}${connector}${symbol} ${id} ${scope}`)

    const children = artifactTypes.filter((a) => a.requires && a.requires.includes(id))
    const newPrefix = isRoot ? prefix : prefix + (isLast ? '    ' : '│   ')

    let i = 0
    for (const child of children) {
      drawNode(child.id, newPrefix, false, i === children.length - 1)
      i++
    }
  }

  let i = 0
  for (const rootId of rootIds) {
    drawNode(rootId, '', true, i === rootIds.length - 1)
    i++
  }

  return lines.map((l) => '  ' + l)
}
