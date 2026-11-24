import { type Command } from 'commander'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'
import { ArtifactDag, type ArtifactStatusEntry, type ArtifactType, type Schema } from '@specd/sdk'
import {
  publicValidity,
  publicVerificationEvidence,
  readStructuredPolicy,
  validityTextLines,
} from './_validity-present.js'
import { enrichImplementationTracking } from './_implementation-tracking.js'
import { resolveChangeSchemaForCli } from '../../helpers/change-schema.js'
import {
  blockerTextLines,
  projectCliBlocker,
  projectCliNextAction,
  projectCliNextActionRecord,
} from '../../guidance-presenter.js'

/**
 * Projects artifact rows for structured output, with the display-status fallback shared by
 * active and drafted status (`displayStatus`, then `effectiveStatus`, then the persisted state).
 *
 * @param artifactStatuses - Artifact rows from `GetStatus`
 * @returns Structured artifact rows
 */
function projectArtifactStatuses(artifactStatuses: ArtifactStatusEntry[]): unknown[] {
  return artifactStatuses.map((a) => ({
    type: a.type,
    state: a.state,
    displayStatus: a.displayStatus ?? a.effectiveStatus ?? a.state,
    effectiveStatus: a.effectiveStatus,
    ...(a.taskCompletion !== undefined ? { taskCompletion: a.taskCompletion } : {}),
    files: a.files.map((file) => ({
      key: file.key,
      filename: file.filename,
      state: file.state,
      displayStatus: file.displayStatus ?? file.state,
      hasDrift: file.hasDrift,
      ...(file.validatedHash !== undefined ? { validatedHash: file.validatedHash } : {}),
    })),
  }))
}

/** Schema metadata attached to lifecycle evaluation. */
type LifecycleSchemaInfo = NonNullable<
  Awaited<
    ReturnType<import('@specd/sdk').Kernel['changes']['status']['execute']>
  >['lifecycle']['schemaInfo']
>

/** Lifecycle projection returned by `kernel.changes.status.execute`. */
type StatusLifecycle = Awaited<
  ReturnType<import('@specd/sdk').Kernel['changes']['status']['execute']>
>['lifecycle']

/**
 * Copies optional check rows from GetStatus when the core payload includes them.
 *
 * @param lifecycle - Lifecycle projection from GetStatus
 * @returns Structured extra fields, or an empty object when both fields are absent
 */
function optionalCheckFields(lifecycle: StatusLifecycle): Record<string, unknown> {
  const extra: Record<string, unknown> = {}
  const withChecks = lifecycle as StatusLifecycle & {
    checksByTarget?: unknown
    checks?: unknown
  }
  if ('checksByTarget' in withChecks && withChecks.checksByTarget !== undefined) {
    extra.checksByTarget = withChecks.checksByTarget
  }
  if ('checks' in withChecks && withChecks.checks !== undefined) {
    extra.checks = withChecks.checks
  }
  return extra
}

/**
 * Resolves the canonical schema DAG for status rendering from the change's own schema,
 * falling back to lifecycle schemaInfo.
 *
 * @param schema - The change's resolved schema, when available
 * @param schemaInfo - Schema snapshot attached to lifecycle
 * @returns DAG and artifact types for rendering
 */
function resolveStatusSchemaDag(
  schema: Schema | undefined,
  schemaInfo: LifecycleSchemaInfo,
): { dag: ArtifactDag; artifactTypes: readonly ArtifactType[] } {
  if (
    schema !== undefined &&
    typeof schema.artifactDag === 'function' &&
    typeof schema.artifacts === 'function'
  ) {
    return {
      dag: schema.artifactDag(),
      artifactTypes: schema.artifacts(),
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
JSON/TOON output schema (every field is described inline after //):
  {
    name: string  // change name
    state: string  // current lifecycle state (for drafted changes, the state the draft is in)
    isDrafted?: boolean  // true only for drafted changes
    specIds: string[]  // spec IDs the change targets
    schema: {  // schema snapshot used to render the change
      name: string  // schema name
      version: number  // schema version
      artifactDag: Array<{  // active changes only; omitted for drafted changes
        id: string  // artifact type id
        scope: string  // artifact scope (spec or change)
        optional: boolean  // whether the artifact may be skipped
        requires: string[]  // ids of artifacts this one depends on
        hasTasks: boolean  // whether the artifact carries a task checklist
        output: string  // output path pattern of the artifact
        children: string[]  // ids of artifacts that depend on this one
      }>
    }
    description?: string  // change description, when set
    invalidation?: {  // effective invalidation policy (active changes)
      artifacts: string  // artifact invalidation policy
      workflow: string  // workflow invalidation policy
    }
    validity?: object  // validity projection: spec/signoff consent validity, drift and projection changes (active changes)
    verification?: object  // verification evidence summary: id, status, fingerprint, validity (active changes)
    schemaWarnings: Array<{  // schema resolution advisories
      code: 'SCHEMA_VERSION_DRIFT'  // advisory code
      changeName: string  // change the advisory applies to
      schemaName: string  // schema the advisory applies to
      recordedVersion: number  // schema version recorded on the change
      resolvedVersion: number  // schema version resolved now
      message: string  // human-readable advisory
    }>
    blockers: Array<{  // conditions currently blocking forward progress
      code: string  // stable blocker code
      message: string  // human-readable explanation
      label?: string  // short check label
      checkId?: string  // id of the check that produced the blocker
      action?: { kind: string, params?: object }  // structured recovery action, when core provides one
      bypassFlag?: string  // CLI flag that bypasses the blocker, when it is skippable
      details?: Record<string, unknown>  // blocker-specific structured details
    }>
    nextAction: {  // recommended next step
      targetStep: string  // lifecycle step the action moves toward
      actionType: string  // kind of action (cognitive or mechanical)
      reason: string  // why this action is recommended
      intent: 'design'|'implement'|'verify'|'archive'|null  // workflow intent, or null when none applies
      action?: { kind: string, params?: object }  // structured action, when core provides one
      command: string | null  // command or skill to run, or null when only guidance applies
      guidance?: string  // advice shown when command is null
    }
    checks?: Array<object>  // drafted changes only: lifecycle check rows, when emitted by core
    checksByTarget?: Record<string, Array<object>>  // drafted changes only: check rows grouped by transition target, when emitted by core
    specDependsOn: Record<string, string[]>  // per spec ID, the spec IDs it depends on
    availableTransitions: string[]  // legacy top-level copy kept for compatibility; active changes should read lifecycle.availableTransitions
    availableSteps: Array<{  // legacy top-level copy kept for compatibility; active changes should read lifecycle.availableSteps
      step: string  // step name
      optional: boolean  // whether the step may be skipped
      available: boolean  // whether the step can be entered now
      isReady: boolean  // whether the step prerequisites are met
      isPermitted: boolean  // whether the schema workflow permits the step
    }>
    lifecycle?: {  // active (non-drafted) changes only
      validTransitions: string[]  // protocol-legal hops
      availableTransitions: string[]  // check-derived hops
      availableSteps: Array<{  // per-step availability
        step: string  // step name
        optional?: boolean  // whether the step may be skipped
        available: boolean  // whether the step can be entered now
        isReady: boolean  // whether the step prerequisites are met
        isPermitted: boolean  // whether the schema workflow permits the step
        blockingArtifacts: string[]  // artifacts that must complete first
      }>
      blockers: Array<{  // per-transition blockers
        transition: string  // transition the blocker applies to
        reason: string  // why the transition is blocked
        blocking: string[]  // artifacts or checks causing the block
      }>
      approvals: {  // approval gate status
        spec: boolean  // spec approval recorded
        signoff: boolean  // signoff approval recorded
      }
      nextArtifact: string | null  // next artifact to work on, or null
      changePath: string  // path to the change directory
      schemaInfo: { name: string, version: number } | null  // schema snapshot, or null when unavailable
      checks?: Array<object>  // lifecycle check rows evaluated for the change, when emitted by core
      checksByTarget?: Record<string, Array<object>>  // lifecycle check rows grouped by transition target, when emitted by core
    }
    implementationTracking?: {  // only with --implementation
      trackedFiles: Array<{  // implementation files tracked for the change
        file: string  // file path
        state: 'open'|'resolved'|'ignored'  // tracking state
      }>
      links: Array<{  // links between specs and implementation files
        specId: string  // linked spec ID
        file: string  // linked file path
        symbols?: string[]  // linked symbols, when recorded
      }>
      graphHealth: object  // code graph health summary
      graphHint: { message: string }  // hint about graph freshness
    }
    approvalGates: {  // whether the approval gates are enabled
      specEnabled: boolean  // spec approval gate enabled
      signoffEnabled: boolean  // signoff approval gate enabled
    }
    artifactDag: Array<{  // DAG with per-artifact state
      id: string  // artifact type id
      scope: string  // artifact scope
      state: string  // artifact state
      requires: string[]  // ids of artifacts this one depends on
      children: string[]  // ids of artifacts that depend on this one
      hasTasks?: boolean  // whether the artifact carries a task checklist
    }>
    artifacts: Array<{  // artifact rows
      type: string  // artifact type id
      state: string  // persisted artifact state
      effectiveStatus: string  // status after drift and dependency evaluation
      displayStatus: string  // user-facing artifact status (falls back to effectiveStatus, then state)
      taskCompletion?: {  // task progress, when the artifact has tasks
        complete: number  // completed tasks
        incomplete: number  // open tasks
        total: number  // all tasks
      }
      files: Array<{  // files of the artifact
        key: string  // file key
        filename: string  // file name
        state: string  // persisted file state
        displayStatus: string  // user-facing file status
        hasDrift: boolean  // true when the file drifted from its validated hash
        validatedHash?: string  // hash recorded at validation
      }>
    }>
    review: {  // review requirement
      required: boolean  // whether review is required
      route: string | null  // lifecycle route to review, or null
      reason: string | null  // why review is required, or null
      message?: string  // additional message
      overlapDetail: Array<{  // archived changes overlapping this one
        archivedChangeName: string  // overlapping archived change
        overlappingSpecIds: string[]  // spec IDs in the overlap
      }>
      affectedArtifacts: Array<{  // artifacts affected by the overlap
        type: string  // artifact type id
        files: Array<{  // affected files
          key: string  // file key
          filename: string  // file name
          path: string  // file path
        }>
      }>
    }
  }
`,
    )
    .action(
      async (name: string, opts: { format: string; implementation?: boolean; config?: string }) => {
        try {
          const host = await resolveCliContext({ configPath: opts.config })
          const { kernel } = host
          const statusResult = await kernel.changes.status.execute({
            name,
          })

          if (statusResult.draftView !== undefined) {
            const draftView = statusResult.draftView
            const { artifactStatuses, lifecycle, specDependsOn } = statusResult
            const nextAction = {
              targetStep: statusResult.nextAction.targetStep,
              actionType: statusResult.nextAction.actionType,
              reason: statusResult.nextAction.reason,
              command: null,
            }
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
              if (statusResult.blockers.length > 0) {
                lines.push('', 'blockers:')
                for (const b of statusResult.blockers) lines.push(...blockerTextLines(b))
              }
              if (statusResult.schemaWarnings.length > 0) {
                lines.push('', 'warnings:')
                for (const advisory of statusResult.schemaWarnings) {
                  lines.push(`  ! ${advisory.code}: ${advisory.message}`)
                }
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
                  schemaWarnings: statusResult.schemaWarnings,
                  blockers: statusResult.blockers.map(projectCliBlocker),
                  availableTransitions: [],
                  availableSteps: [],
                  ...optionalCheckFields(lifecycle),
                  nextAction,
                  artifacts: projectArtifactStatuses(artifactStatuses),
                },
                fmt,
              )
            }
            return
          }

          const change = statusResult.change!
          const { artifactStatuses, lifecycle, review, blockers, nextAction } = statusResult
          const implementationTracking = opts.implementation
            ? await enrichImplementationTracking(host, name)
            : undefined

          const fmt = parseFormat(opts.format)
          const validity = publicValidity(statusResult.validity)
          const evidence = publicVerificationEvidence(change)
          const invalidation = readStructuredPolicy(change)

          if (fmt === 'text') {
            const lines = [`change:      ${change.name}`, `state:       ${change.state}`]
            if (change.description !== undefined) {
              lines.push(`description: ${change.description}`)
            }
            if (invalidation !== undefined) {
              lines.push(
                `policy:      artifacts=${invalidation.artifacts} workflow=${invalidation.workflow}`,
              )
            }
            const validityLines = validityTextLines(validity, evidence)
            if (validityLines.length > 0) {
              lines.push('')
              lines.push('validity:')
              for (const line of validityLines) lines.push(`  ${line}`)
            }
            lines.push('')

            // Artifact DAG Section
            if (lifecycle.schemaInfo !== null) {
              const { schema } = await resolveChangeSchemaForCli(kernel, name)
              const { dag, artifactTypes } = resolveStatusSchemaDag(schema, lifecycle.schemaInfo)
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

            // Invalidation overlap is review, not an OVERLAP_CONFLICT line.
            const textBlockers =
              review?.reason === 'spec-overlap-conflict'
                ? blockers.filter((blocker) => blocker.code !== 'OVERLAP_CONFLICT')
                : blockers

            // Blockers Section
            if (textBlockers.length > 0) {
              lines.push('blockers:')
              for (const b of textBlockers) lines.push(...blockerTextLines(b))
              lines.push('')
            }

            if (review?.required === true) {
              lines.push('review:')
              lines.push(`  required: ${review.required ? 'yes' : 'no'}`)
              lines.push(`  route:    ${review.route ?? '(none)'}`)
              lines.push(`  reason:   ${review.reason ?? '(none)'}`)
              if (review.message !== undefined && review.message !== '') {
                lines.push(`  message:  ${review.message}`)
              }
              lines.push('')
            }

            // Schema resolution advisories
            const schemaWarnings = statusResult.schemaWarnings
            if (schemaWarnings.length > 0) {
              lines.push('warnings:')
              for (const advisory of schemaWarnings) {
                lines.push(`  ! ${advisory.code}: ${advisory.message}`)
              }
              lines.push('')
            }

            const projectedNextAction = projectCliNextAction(nextAction, blockers)

            // Next Action Section
            lines.push('next action:')
            lines.push(`  target:  ${projectedNextAction.targetStep}`)
            lines.push(`  command: ${projectedNextAction.command ?? '(none)'}`)
            if (
              projectedNextAction.command === null &&
              projectedNextAction.guidance !== undefined
            ) {
              lines.push(`  guidance: ${projectedNextAction.guidance}`)
            }
            lines.push(`  reason:  ${projectedNextAction.reason}`)
            lines.push('')

            // Lifecycle Section
            lines.push('lifecycle:')
            if (lifecycle.availableTransitions.length > 0) {
              lines.push(`  transitions:  ${lifecycle.availableTransitions.join(', ')}`)
            }
            if ((lifecycle.availableSteps ?? []).length > 0) {
              const formattedSteps = (lifecycle.availableSteps ?? []).map((step) => {
                const s = step as typeof step & { optional?: boolean }
                return s.optional ? `${step.step} [optional]` : step.step
              })
              lines.push(`  extras:      ${formattedSteps.join(', ')}`)
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
                  const symbolSuffix =
                    link.symbols !== undefined && link.symbols.length > 0
                      ? `  symbols=${link.symbols.join(', ')}`
                      : '  file-level'
                  lines.push(`    - ${link.specId} -> ${link.file}${symbolSuffix}`)
                  for (const reviewed of link.symbolResolutions ?? []) {
                    const { resolution } = reviewed
                    lines.push(
                      `        ${reviewed.symbol}: ${resolution.status}${resolution.reasonCode === null ? '' : ` (${resolution.reasonCode})`}`,
                    )
                    if (resolution.target !== null) {
                      lines.push(`          target: ${resolution.target.id}`)
                    }
                    if (resolution.candidates.length > 0) {
                      lines.push(
                        `          candidates: ${resolution.candidates.map((candidate) => candidate.target.id).join(', ')}`,
                      )
                    }
                    if (resolution.path.length > 0) {
                      lines.push(
                        `          provenance: ${resolution.path.map((step) => `${step.kind}:${step.fromId}->${step.toId}`).join(' | ')}`,
                      )
                    }
                  }
                }
              } else {
                lines.push('  links:         (none)')
              }
            }

            if (
              review?.required === true &&
              review.reason === 'spec-overlap-conflict' &&
              review.overlapDetail.length > 0
            ) {
              lines.push('')
              lines.push('overlap:')
              for (const entry of review.overlapDetail) {
                lines.push(
                  `  - archived: ${entry.archivedChangeName}, specs: ${entry.overlappingSpecIds.join(', ')}`,
                )
              }
            }

            lines.push('')
            lines.push('artifacts (details):')
            for (const a of artifactStatuses) {
              const displayStatus = a.displayStatus ?? a.effectiveStatus ?? a.state
              const taskSuffix =
                a.taskCompletion !== undefined
                  ? `  tasks: ${a.taskCompletion.complete}/${a.taskCompletion.total}`
                  : ''
              lines.push(
                `  ${a.type}  ${displayStatus}  (effective: ${a.effectiveStatus})${taskSuffix}`,
              )
              for (const file of a.files) {
                const fileDisplayStatus = file.displayStatus ?? file.state
                const hash = file.validatedHash !== undefined ? `  ${file.validatedHash}` : ''
                const drift = file.hasDrift ? '  [drift]' : ''
                lines.push(
                  `    - ${file.key}  ${fileDisplayStatus}  ${file.filename}${hash}${drift}`,
                )
              }
            }

            output(lines.join('\n'), 'text')
          } else {
            const schemaInfo = lifecycle.schemaInfo
            const statusDag =
              schemaInfo !== null
                ? resolveStatusSchemaDag(
                    (await resolveChangeSchemaForCli(kernel, name)).schema,
                    schemaInfo,
                  )
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
                ...(invalidation !== undefined ? { invalidation } : {}),
                ...(validity !== undefined ? { validity } : {}),
                ...(evidence !== undefined ? { verification: evidence } : {}),
                schemaWarnings: statusResult.schemaWarnings,
                blockers: blockers.map(projectCliBlocker),
                nextAction: projectCliNextActionRecord(nextAction, blockers),
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
                artifacts: projectArtifactStatuses(artifactStatuses),
                review: {
                  required: review?.required ?? false,
                  route: review?.route ?? null,
                  reason: review?.reason ?? null,
                  ...(review?.message !== undefined ? { message: review.message } : {}),
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
                  availableSteps: (lifecycle.availableSteps ?? []).map((step) => {
                    const s = step as typeof step & { optional?: boolean }
                    return {
                      step: step.step,
                      ...(s.optional !== undefined ? { optional: s.optional } : {}),
                      available: step.available,
                      isReady: step.isReady,
                      isPermitted: step.isPermitted,
                      blockingArtifacts: [...step.blockingArtifacts],
                    }
                  }),
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
                  ...optionalCheckFields(lifecycle),
                },
                ...(opts.implementation && implementationTracking !== undefined
                  ? {
                      implementationTracking: {
                        trackedFiles: implementationTracking.trackedFiles,
                        links: implementationTracking.links,
                        graphHealth: implementationTracking.graphHealth,
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
    const hasTasks = artifact.hasTasks === true || artifact.taskCompletionCheck !== undefined
    const taskTag = hasTasks
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
