import {
  type Change,
  type ChangeEvent,
  type DiscardedChangeView,
  type DraftedChangeView,
  type GetArtifactInstructionResult,
  type GetHookInstructionsResult,
  type GetImplementationReviewResult,
  type GetStatusResult,
  type ReadOnlyChangeView,
} from '@specd/core'
import { type ChangeDetailDto, type ChangeHistoryEventDto } from '../dto/change-detail.js'
import { type ChangeStatusDto } from '../dto/change-status.js'
import { type ChangeSummaryDto } from '../dto/change-summary.js'
import { type ArtifactListDto, type ArtifactListEntryDto } from '../dto/artifact-list.js'
import { type ImplementationReviewDto } from '../dto/implementation-review.js'

type TaskSummaryByType = ReadonlyMap<
  string,
  { readonly totalTasks: number; readonly completedTasks: number }
>

/**
 * Maps hook instructions to the shared DTO shape.
 *
 * @param result - Core hook instructions result.
 * @returns Hook instructions DTO.
 */
export function toHookInstructionsDto(result: GetHookInstructionsResult): Record<string, unknown> {
  return {
    phase: result.phase,
    instructions: result.instructions.map((i) => ({
      id: i.id,
      text: i.text,
    })),
  }
}

/**
 * Maps artifact instruction to the shared DTO shape.
 *
 * @param result - Core artifact instruction result.
 * @returns Artifact instruction DTO.
 */
export function toArtifactInstructionDto(
  result: GetArtifactInstructionResult,
): Record<string, unknown> {
  return {
    artifactId: result.artifactId,
    rulesPre: [...result.rulesPre],
    instruction: result.instruction,
    template: result.template,
    delta: result.delta
      ? {
          formatInstructions: result.delta.formatInstructions,
          domainInstructions: result.delta.domainInstructions,
          availableOutlines: [...result.delta.availableOutlines],
        }
      : null,
    rulesPost: [...result.rulesPost],
  }
}

/**
 *
 * @param d
 */
function iso(d: Date): string {
  return d.toISOString()
}

function resolveUpdatedAt(input: {
  readonly updatedAt?: Date
  readonly createdAt: Date
  readonly history: readonly ChangeEvent[]
}): Date {
  if (input.updatedAt instanceof Date) return input.updatedAt
  const last = input.history[input.history.length - 1]
  return last?.at ?? input.createdAt
}

/**
 *
 * @param event
 */
function historyEventDto(event: ChangeEvent): ChangeHistoryEventDto {
  const base = {
    type: event.type,
    at: iso(event.at),
    by: { name: event.by.name, email: event.by.email },
  }
  if (event.type === 'created') {
    return {
      ...base,
      specIds: [...event.specIds],
      schemaName: event.schemaName,
      schemaVersion: event.schemaVersion,
    }
  }
  if (event.type === 'transitioned') {
    return { ...base, from: event.from, to: event.to }
  }
  if (event.type === 'invalidated') {
    return { ...base, cause: event.cause }
  }
  return base
}

/**
 * Maps change entities to summary DTOs.
 * @param change
 * @param blockerCount
 */
export function toChangeSummaryDto(
  change: Change | DraftedChangeView | DiscardedChangeView,
  blockerCount = 0,
): ChangeSummaryDto {
  const updatedAt = resolveUpdatedAt(change)
  return {
    name: change.name,
    ...(change.description !== undefined ? { description: change.description } : {}),
    state: change.state,
    specIds: [...change.specIds],
    updatedAt: iso(updatedAt),
    blockerCount,
  }
}

/**
 * Maps a change entity to detail DTO (no artifact bodies).
 * @param change
 */
export function toChangeDetailDto(change: Change | ReadOnlyChangeView): ChangeDetailDto {
  const specApproved = change.history.some((e) => e.type === 'spec-approved')
  const signoffApproved = change.history.some((e) => e.type === 'signed-off')
  return {
    name: change.name,
    state: change.state,
    specIds: [...change.specIds],
    specDependsOn:
      'specDependsOn' in change
        ? Object.fromEntries([...change.specDependsOn.entries()].map(([k, deps]) => [k, [...deps]]))
        : {},
    schemaName: change.schemaName,
    schemaVersion: change.schemaVersion,
    ...('invalidationPolicy' in change && change.invalidationPolicy !== undefined
      ? { invalidationPolicy: change.invalidationPolicy }
      : {}),
    ...(change.description !== undefined ? { description: change.description } : {}),
    updatedAt: iso(resolveUpdatedAt(change)),
    history: change.history.map(historyEventDto),
    approvals: { specApproved, signoffApproved },
  }
}

/**
 * Maps {@link GetStatusResult} to {@link ChangeStatusDto}.
 * @param result
 */
export function toChangeStatusDto(result: GetStatusResult): ChangeStatusDto {
  const { unchanged } = result
  const base = result.change ?? result.draftView
  if (!base) {
    throw new Error('GetStatusResult missing both change and draftView')
  }
  const updatedAt = iso(resolveUpdatedAt(base))

  if (unchanged === true) {
    return {
      name: base.name,
      state: base.state,
      updatedAt,
      unchanged: true,
    }
  }

  const taskArtifacts = result.artifactStatuses.filter((artifact) => artifact.hasTasks)
  const totalTasks = taskArtifacts.reduce(
    (sum, artifact) => sum + (artifact.taskCompletion?.total ?? 0),
    0,
  )
  const completedTasks = taskArtifacts.reduce(
    (sum, artifact) => sum + (artifact.taskCompletion?.complete ?? 0),
    0,
  )

  return {
    name: base.name,
    state: base.state,
    updatedAt,
    specIds: [...base.specIds],
    blockers: result.blockers.map((b) => ({ code: b.code, message: b.message })),
    nextAction: {
      targetStep: result.nextAction.targetStep,
      actionType: result.nextAction.actionType,
      reason: result.nextAction.reason,
      command: result.nextAction.command,
    },
    ...(taskArtifacts.length > 0 ? { totalTasks, completedTasks } : {}),
    artifacts: result.artifactStatuses.map((a) => ({
      type: a.type,
      hasTasks: a.hasTasks,
      ...(a.taskCompletion !== undefined
        ? {
            totalTasks: a.taskCompletion.total,
            completedTasks: a.taskCompletion.complete,
          }
        : {}),
      state: a.state,
      effectiveStatus: a.effectiveStatus,
      displayStatus: a.displayStatus,
      files: a.files.map((f) => ({
        key: f.key,
        filename: f.filename,
        state: f.state,
        hasDrift: f.hasDrift,
        displayStatus: f.displayStatus,
      })),
    })),
    review: {
      required: result.review.required,
      route: result.review.route,
      reason: result.review.reason,
    },
    lifecycle: {
      validTransitions: [...result.lifecycle.validTransitions],
      availableTransitions: [...result.lifecycle.availableTransitions],
      changePath: result.lifecycle.changePath,
    },
  }
}

/**
 * Lists tracked artifacts from change entity (metadata only).
 * @param change
 */
export function toArtifactListDto(change: Change): ArtifactListDto {
  return toArtifactListDtoFromView(change)
}

/**
 * Lists tracked artifacts from a read-only change view (metadata only).
 * @param view
 */
export function toArtifactListDtoFromView(
  view: ReadOnlyChangeView,
  options: {
    omitMissing?: boolean
    hasTasksByType?: ReadonlyMap<string, boolean>
    taskSummaryByType?: TaskSummaryByType
  } = {},
): ArtifactListDto {
  const entries: ArtifactListEntryDto[] = []
  for (const artifact of view.artifacts.values()) {
    for (const file of artifact.files.values()) {
      if (options.omitMissing === true && file.status === 'missing') {
        continue
      }
      entries.push({
        filename: file.filename,
        type: artifact.type,
        hasTasks: options.hasTasksByType?.get(artifact.type) ?? false,
        ...(options.taskSummaryByType?.get(artifact.type) !== undefined
          ? options.taskSummaryByType.get(artifact.type)
          : {}),
        state: file.status,
        displayStatus: file.displayStatus(),
      })
    }
  }
  return { artifacts: entries }
}

/**
 * Maps {@link GetImplementationReview} kernel output to API wire shape.
 */
export function toImplementationReviewDto(
  result: GetImplementationReviewResult,
): ImplementationReviewDto {
  return {
    specIds: [...result.specIds],
    implementationTracking: {
      links: result.implementationTracking.links.map((link) => ({
        specId: link.specId,
        file: link.file,
        fileLinkExplicit: link.fileLinkExplicit,
        ...(link.symbols !== undefined ? { symbols: [...link.symbols] } : {}),
      })),
      trackedFiles: result.implementationTracking.trackedFiles.map((entry) => ({
        file: entry.file,
        state: entry.state,
      })),
    },
  }
}
