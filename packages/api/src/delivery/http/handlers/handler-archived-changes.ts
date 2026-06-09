import { safeRegex, type ArchivedChange, type Kernel } from '@specd/core'
import { type FastifyInstance } from 'fastify'
import { apiHandler } from '../handler-utils.js'
import {
  apiRouteSchema,
  PARAMS_CHANGE_NAME,
  PARAMS_CHANGE_NAME_FILENAME,
} from '../route-schema.js'
import { toArtifactContentDto } from '../presenters/presenter-artifact.js'
import { toChangeDetailDto } from '../presenters/presenter-change.js'

/**
 * Registers archived change read routes.
 * @param app
 */
export function registerArchivedChangesRoutes(app: FastifyInstance): void {
  app.get(
    '/archived-changes/:name',
    {
      ...apiRouteSchema({
        params: PARAMS_CHANGE_NAME,
        response: { 200: 'ArchivedChangeDetailDto' },
      }),
    },
    apiHandler(async (ctx, req) => {
      const { name } = req.params as { name: string }
      const archived = await ctx.kernel.changes.getArchived.execute({ name })
      return toArchivedChangeDto(ctx, archived)
    }),
  )

  app.get(
    '/archived-changes/:name/artifacts/:filename',
    {
      ...apiRouteSchema({
        params: PARAMS_CHANGE_NAME_FILENAME,
        response: { 200: 'ArtifactContentDto' },
      }),
    },
    apiHandler(async (ctx, req) => {
      const { name, filename } = req.params as { name: string; filename: string }
      const result = await ctx.kernel.changes.getReadOnlyChangeArtifact.execute({
        readOnlyOrigin: 'archived',
        name,
        filename,
      })
      return toArtifactContentDto(result)
    }),
  )
}

async function toArchivedArtifactEntries(
  ctx: { kernel: Kernel },
  change: ArchivedChange,
) {
  const schemaResult = await ctx.kernel.specs.getActiveSchema.execute()
  const taskCapableByType = new Map<string, { incompletePattern?: string; completePattern?: string }>()
  if (!schemaResult.raw) {
    for (const artifactType of schemaResult.schema.artifacts()) {
      if (!artifactType.hasTasks) continue
      taskCapableByType.set(artifactType.id, {
        incompletePattern: artifactType.taskCompletionCheck?.incompletePattern,
        completePattern: artifactType.taskCompletionCheck?.completePattern,
      })
    }
  }
  const taskSummaryByType = new Map<string, { totalTasks: number; completedTasks: number }>()
  const trackedFiles = [...change.artifacts.values()].flatMap((artifact) =>
    [...artifact.files.values()].map((file) => ({
      filename: file.filename,
      type: artifact.type,
      storedState: file.status,
      storedDisplayStatus: file.displayStatus(),
    })),
  )

  const loadedFiles = await Promise.all(
    trackedFiles.map(async (file) => {
      try {
        const content = await ctx.kernel.changes.getReadOnlyChangeArtifact.execute({
          readOnlyOrigin: 'archived',
          name: change.name,
          filename: file.filename,
        })
        const taskConfig = taskCapableByType.get(file.type)
        if (taskConfig?.incompletePattern !== undefined) {
          const incompleteRe = safeRegex(taskConfig.incompletePattern, 'gm')
          const completeRe =
            taskConfig.completePattern !== undefined
              ? safeRegex(taskConfig.completePattern, 'gm')
              : null
          if (incompleteRe !== null) {
            const current = taskSummaryByType.get(file.type) ?? {
              totalTasks: 0,
              completedTasks: 0,
            }
            const incompleteCount = (content.content.match(incompleteRe) ?? []).length
            const completeCount =
              completeRe !== null ? (content.content.match(completeRe) ?? []).length : 0
            taskSummaryByType.set(file.type, {
              totalTasks: current.totalTasks + incompleteCount + completeCount,
              completedTasks: current.completedTasks + completeCount,
            })
          }
        }
        return file
      } catch {
        return null
      }
    }),
  )

  return loadedFiles
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .map((file) => ({
      filename: file.filename,
      type: file.type,
      hasTasks: taskCapableByType.has(file.type),
      ...(taskSummaryByType.get(file.type) ?? {}),
      state: file.storedState === 'missing' ? 'complete' : file.storedState,
      displayStatus: file.storedState === 'missing' ? 'complete' : file.storedDisplayStatus,
    }))
}

async function toArchivedChangeDto(
  ctx: { kernel: Kernel },
  change: ArchivedChange,
) {
  const detail = toChangeDetailDto(change)
  const artifacts = await toArchivedArtifactEntries(ctx, change)
  return {
    ...detail,
    state: 'archived',
    archivedName: change.archivedName,
    archivedAt: change.archivedAt.toISOString(),
    ...(change.archivedBy !== undefined ? { archivedBy: change.archivedBy } : {}),
    workspaces: [...change.workspaces],
    artifacts,
    archivedMeta: {
      archivedName: change.archivedName,
      archivedAt: change.archivedAt.toISOString(),
      artifactTypes: [...new Set(artifacts.map((artifact) => artifact.type))],
    },
  }
}
