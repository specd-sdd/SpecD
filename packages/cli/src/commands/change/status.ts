import { type Command } from 'commander'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'
import { ArtifactDag, type ArtifactStatusEntry, type ArtifactType } from '@specd/core'
import { enrichImplementationTracking } from './_implementation-tracking.js'

/** Resolved active schema from the kernel. */
type ActiveSchemaResult = Awaited<
  ReturnType<import('@specd/core').Kernel['specs']['getActiveSchema']['execute']>
>

/** Schema metadata attached to lifecycle evaluation. */
type LifecycleSchemaInfo = NonNullable<
  Awaited<
    ReturnType<import('@specd/core').Kernel['changes']['status']['execute']>
  >['lifecycle']['schemaInfo']
>

/**
 * Resolves the canonical schema DAG for status rendering, falling back to lifecycle schemaInfo.
 *
 * @param activeSchema - Result from `getActiveSchema`
 * @param schemaInfo - Schema snapshot attached to lifecycle
 * @returns DAG and artifact types for rendering
 */
function resolveStatusSchemaDag(
  activeSchema: ActiveSchemaResult,
  schemaInfo: LifecycleSchemaInfo,
): { dag: ArtifactDag; artifactTypes: readonly ArtifactType[] } {
  if (
    !activeSchema.raw &&
    typeof activeSchema.schema.artifactDag === 'function' &&
    typeof activeSchema.schema.artifacts === 'function'
  ) {
    return {
      dag: activeSchema.schema.artifactDag(),
      artifactTypes: activeSchema.schema.artifacts(),
    }
  }
  return {
    dag: ArtifactDag.from(schemaInfo.artifacts),
    artifactTypes: schemaInfo.artifacts,
  }
}

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
    .option('--implementation', 'show implementation tracking details')
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
    specDependsOn: Record<string, string[]>
    artifactDag: Array<{ id: string, scope: string, state: string, requires: string[], children: string[] }>
    artifacts: Array<{
      type: string
      state: string
      effectiveStatus: string
      taskCompletion?: { complete: number, incomplete: number, total: number }
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
    .action(
      async (name: string, opts: { format: string; implementation?: boolean; config?: string }) => {
        try {
          const { config, kernel } = await resolveCliContext({ configPath: opts.config })
          const active = await kernel.changes.repo.get(name)
          if (active !== null) {
            await kernel.changes.refreshImplementationTracking.execute({ name })
          }
          const statusResult = await kernel.changes.status.execute({
            name,
          })

          if (statusResult.draftView !== undefined) {
            const draftView = statusResult.draftView
            const { artifactStatuses, lifecycle, nextAction, specDependsOn } = statusResult
            const fmt = parseFormat(opts.format)
            if (fmt === 'text') {
              const lines = [
                `change:      ${draftView.name}`,
                `state:       ${draftView.state} (drafted)`,
                '',
                'specs and dependencies:',
              ]
              for (const specId of draftView.specIds) {
                const deps = specDependsOn[specId]
                lines.push(`  ${specId}: ${deps?.length ? deps.join(', ') : '(none)'}`)
              }
              lines.push(
                '',
                'next action:',
                `  target:  ${nextAction.targetStep}`,
                `  command: ${nextAction.command ?? '(none)'}`,
                `  reason:  ${nextAction.reason}`,
                '',
                'lifecycle:',
                '  transitions:  (none — change is drafted)',
                `  path:          ${lifecycle.changePath}`,
              )
              output(lines.join('\n'), 'text')
            } else {
              output(
                {
                  name: draftView.name,
                  state: draftView.state,
                  isDrafted: true,
                  specIds: [...draftView.specIds],
                  schema: { name: draftView.schemaName, version: draftView.schemaVersion },
                  specDependsOn,
                  availableTransitions: lifecycle.availableTransitions,
                  nextAction,
                  artifacts: artifactStatuses,
                },
                fmt,
              )
            }
            return
          }

          const change = statusResult.change!
          const { artifactStatuses, lifecycle, review, blockers, nextAction } = statusResult
          const implementationTracking = opts.implementation
            ? await enrichImplementationTracking(config, statusResult.implementationTracking)
            : undefined

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
            const lines = [`change:      ${change.name}`, `state:       ${change.state}`]
            if (change.description !== undefined) {
              lines.push(`description: ${change.description}`)
            }
            lines.push('')

            // Artifact DAG Section
            if (lifecycle.schemaInfo !== null) {
              const activeSchema = await kernel.specs.getActiveSchema.execute()
              const { dag, artifactTypes } = resolveStatusSchemaDag(
                activeSchema,
                lifecycle.schemaInfo,
              )
              lines.push('artifacts (DAG):')
              lines.push(
                '  [✓] complete  [ ] missing  [!] drifted  [~] needs review  [?] in-progress',
              )
              lines.push('')
              lines.push(...renderDag(dag, artifactTypes, artifactStatuses))
              lines.push('')
            }

            // Specs and Dependencies Section
            lines.push('specs and dependencies:')
            for (const specId of change.specIds) {
              const deps = statusResult.specDependsOn[specId]
              lines.push(`  ${specId}: ${deps?.length ? deps.join(', ') : '(none)'}`)
            }
            lines.push('')

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

            if (opts.implementation && implementationTracking !== undefined) {
              lines.push('')
              lines.push('implementation:')
              lines.push(`  graph:         ${implementationTracking.graphHint.message}`)
              for (const state of ['open', 'resolved', 'ignored'] as const) {
                const files = implementationTracking.trackedFiles.filter(
                  (entry) => entry.state === state,
                )
                lines.push(
                  `  ${state}: ${files.length > 0 ? files.map((entry) => entry.file).join(', ') : '(none)'}`,
                )
              }
              if (implementationTracking.links.length > 0) {
                lines.push('  links:')
                for (const link of implementationTracking.links) {
                  const staleSuffix =
                    link.staleSymbols.length > 0 ? `  [stale: ${link.staleSymbols.join(', ')}]` : ''
                  const symbolSuffix =
                    link.symbols !== undefined && link.symbols.length > 0
                      ? `  symbols=${link.symbols.join(', ')}`
                      : '  file-level'
                  lines.push(`    - ${link.specId} -> ${link.file}${symbolSuffix}${staleSuffix}`)
                }
              } else {
                lines.push('  links:         (none)')
              }
            }

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
              const taskSuffix =
                a.taskCompletion !== undefined
                  ? `  tasks: ${a.taskCompletion.complete}/${a.taskCompletion.total}`
                  : ''
              lines.push(
                `  ${a.type}  ${a.displayStatus}  (effective: ${a.effectiveStatus})${taskSuffix}`,
              )
              for (const file of a.files) {
                const hash = file.validatedHash !== undefined ? `  ${file.validatedHash}` : ''
                const drift = file.hasDrift ? '  [drift]' : ''
                lines.push(
                  `    - ${file.key}  ${file.displayStatus}  ${file.filename}${hash}${drift}`,
                )
              }
            }

            output(lines.join('\n'), 'text')
          } else {
            const schemaInfo = lifecycle.schemaInfo
            const statusDag =
              schemaInfo !== null
                ? resolveStatusSchemaDag(await kernel.specs.getActiveSchema.execute(), schemaInfo)
                : null
            const schemaPayload =
              schemaInfo !== null && statusDag !== null
                ? {
                    name: schemaInfo.name,
                    version: schemaInfo.version,
                    artifactDag: statusDag.dag.topologicalOrder().map((id) => {
                      const a = statusDag.artifactTypes.find((art) => art.id === id)
                      if (a === undefined) {
                        throw new Error(`Schema artifact "${id}" missing from lifecycle schemaInfo`)
                      }
                      return {
                        id: a.id,
                        scope: a.scope,
                        optional: a.optional ?? false,
                        requires: a.requires ?? [],
                        hasTasks: a.hasTasks === true || a.taskCompletionCheck !== undefined,
                        output: a.output,
                        children: [...statusDag.dag.childrenOf(a.id)],
                      }
                    }),
                  }
                : undefined
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
                specDependsOn: statusResult.specDependsOn,
                artifactDag:
                  statusDag === null
                    ? []
                    : statusDag.dag
                        .topologicalOrder()
                        .map((id) => {
                          const a = statusDag.artifactTypes.find((art) => art.id === id)
                          if (a === undefined) return null
                          return {
                            id: a.id,
                            scope: a.scope,
                            state:
                              artifactStatuses.find((as) => as.type === a.id)?.displayStatus ??
                              'missing',
                            requires: a.requires ?? [],
                            hasTasks: a.hasTasks === true || a.taskCompletionCheck !== undefined,
                            children: [...statusDag.dag.childrenOf(a.id)],
                          }
                        })
                        .filter((entry): entry is NonNullable<typeof entry> => entry !== null),
                artifacts: artifactStatuses.map((a) => ({
                  type: a.type,
                  state: a.state,
                  displayStatus: a.displayStatus,
                  effectiveStatus: a.effectiveStatus,
                  ...(a.taskCompletion !== undefined ? { taskCompletion: a.taskCompletion } : {}),
                  files: a.files.map((file) => ({
                    key: file.key,
                    filename: file.filename,
                    state: file.state,
                    displayStatus: file.displayStatus,
                    hasDrift: file.hasDrift,
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
                ...(opts.implementation && implementationTracking !== undefined
                  ? {
                      implementationTracking: {
                        trackedFiles: implementationTracking.trackedFiles,
                        links: implementationTracking.links,
                        graphHint: implementationTracking.graphHint,
                      },
                    }
                  : {}),
                ...(schemaPayload !== undefined ? { schema: schemaPayload } : {}),
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
      },
    )
}

/**
 * Renders the artifact dependency graph as an ASCII tree.
 *
 * @param dag - Schema-derived artifact DAG (roots and child ordering)
 * @param artifactTypes - All artifact types defined in the schema
 * @param artifactStatuses - Current statuses for all artifacts in the change
 * @returns Array of formatted lines representing the tree
 */
function renderDag(
  dag: ArtifactDag,
  artifactTypes: readonly ArtifactType[],
  artifactStatuses: ArtifactStatusEntry[],
): string[] {
  const rootIds = [...dag.roots()]
  const lines: string[] = []

  const stateSymbols: Record<string, string> = {
    complete: '[✓]',
    'complete-with-drift': '[!]',
    skipped: '[✓]',
    missing: '[ ]',
    'drifted-pending-review': '[!]',
    'pending-review': '[~]',
    'pending-parent-artifact-review': '[~]',
    'in-progress': '[?]',
  }

  const visited = new Set<string>()

  /**
   * Draws a single node and recursively its children.
   *
   * @param id - The artifact type ID to draw
   * @param prefix - Indentation prefix for the line
   * @param isRoot - Whether this is a root node
   * @param isLast - Whether this is the last child of its parent
   */
  function drawNode(id: string, prefix: string, isRoot: boolean, isLast: boolean): void {
    if (visited.has(id)) return
    visited.add(id)

    const artifact = artifactTypes.find((a) => a.id === id)
    if (!artifact) return

    const artifactStatus = artifactStatuses.find((as) => as.type === id)
    const status = artifactStatus?.displayStatus ?? artifactStatus?.effectiveStatus ?? 'missing'
    const symbol = stateSymbols[status] ?? '[?]'
    const scope = `[scope: ${artifact.scope}]`

    const connector = isRoot ? '' : isLast ? '└── ' : '├── '
    const taskTag = artifact.hasTasks
      ? artifactStatus?.taskCompletion !== undefined
        ? ` [hasTasks - ${artifactStatus.taskCompletion.complete}/${artifactStatus.taskCompletion.total} done]`
        : ' [hasTasks]'
      : ''
    lines.push(`${prefix}${connector}${symbol} ${id} ${scope}${taskTag}`)

    const children = dag.childrenOf(id)
    const newPrefix = isRoot ? prefix : prefix + (isLast ? '    ' : '│   ')

    let i = 0
    for (const childId of children) {
      drawNode(childId, newPrefix, false, i === children.length - 1)
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
