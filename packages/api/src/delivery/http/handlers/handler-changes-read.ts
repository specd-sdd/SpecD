import { ChangeNotFoundError, type Kernel } from '@specd/core'
import { buildCompileContextConfig } from '../compile-config.js'
import {
  formatCompiledContextMarkdown,
  resolveCompileContextStep,
} from '../format-compiled-context.js'
import { type FastifyInstance } from 'fastify'
import { apiHandler } from '../handler-utils.js'
import {
  toArtifactListDtoFromView,
  toChangeDetailDto,
  toChangeStatusDto,
} from '../presenters/presenter-change.js'
import { toArtifactContentDto } from '../presenters/presenter-artifact.js'
import { toImplementationReviewDto } from '../presenters/presenter-change.js'
import {
  apiRouteSchema,
  BOOLEAN_QUERY_SCHEMA,
  CHANGE_STATE_QUERY_SCHEMA,
  DATE_TIME_STRING_SCHEMA,
  NON_EMPTY_STRING_SCHEMA,
  PARAMS_CHANGE_NAME,
  PARAMS_CHANGE_NAME_ARTIFACT_ID,
  PARAMS_CHANGE_NAME_FILENAME,
  POSITIVE_INTEGER_QUERY_SCHEMA,
  strictObjectSchema,
} from '../route-schema.js'

async function readArtifactTaskMaps(ctx: { kernel: Kernel }) {
  const schemaResult = await ctx.kernel.specs.getActiveSchema.execute()
  if (schemaResult.raw) {
    return {
      hasTasksByType: new Map<string, boolean>(),
      taskSummaryByType: new Map<string, { totalTasks: number; completedTasks: number }>(),
    }
  }
  const hasTasksByType = new Map<string, boolean>(
    schemaResult.schema
      .artifacts()
      .map((artifactType) => [artifactType.id, artifactType.hasTasks] as [string, boolean]),
  )
  return {
    hasTasksByType,
    taskSummaryByType: new Map<string, { totalTasks: number; completedTasks: number }>(),
  }
}

async function readArtifactTaskMapsForChange(ctx: { kernel: Kernel }, name: string) {
  const [maps, status] = await Promise.all([
    readArtifactTaskMaps(ctx),
    ctx.kernel.changes.status.execute({ name }),
  ])
  const taskSummaryByType = new Map<string, { totalTasks: number; completedTasks: number }>()
  for (const artifact of status.artifactStatuses) {
    if (!artifact.hasTasks || artifact.taskCompletion === undefined) continue
    taskSummaryByType.set(artifact.type, {
      totalTasks: artifact.taskCompletion.total,
      completedTasks: artifact.taskCompletion.complete,
    })
  }
  return { ...maps, taskSummaryByType }
}

const STATUS_QUERY = strictObjectSchema({
  properties: { ifModifiedSince: DATE_TIME_STRING_SCHEMA },
})

const CHANGE_STATUS_QUERY = strictObjectSchema({
  properties: {
    ifModifiedSince: DATE_TIME_STRING_SCHEMA,
    refreshImplementation: BOOLEAN_QUERY_SCHEMA,
  },
})

const COMPILE_CONTEXT_QUERY = strictObjectSchema({
  properties: {
    includeChangeSpecs: BOOLEAN_QUERY_SCHEMA,
    followDeps: BOOLEAN_QUERY_SCHEMA,
    depth: POSITIVE_INTEGER_QUERY_SCHEMA,
    fingerprint: NON_EMPTY_STRING_SCHEMA,
    step: CHANGE_STATE_QUERY_SCHEMA,
  },
})

/**
 * Registers read routes for a single change under `/v1`.
 * @param app
 */
export function registerChangesReadRoutes(app: FastifyInstance): void {
  app.get(
    '/drafts/:name',
    {
      ...apiRouteSchema({
        params: PARAMS_CHANGE_NAME,
        response: { 200: 'ChangeDetailDto' },
      }),
    },
    apiHandler(async (ctx, req) => {
      const { name } = req.params as { name: string }
      const view = await ctx.kernel.changes.repo.getDraft(name)
      if (view === null) {
        throw new ChangeNotFoundError(name)
      }
      return toChangeDetailDto(view)
    }),
  )

  app.get(
    '/discarded/:name',
    {
      ...apiRouteSchema({
        params: PARAMS_CHANGE_NAME,
        response: { 200: 'ChangeDetailDto' },
      }),
    },
    apiHandler(async (ctx, req) => {
      const { name } = req.params as { name: string }
      const view = await ctx.kernel.changes.repo.getDiscarded(name)
      if (view === null) {
        throw new ChangeNotFoundError(name)
      }
      return toChangeDetailDto(view)
    }),
  )

  app.get(
    '/changes/:name',
    {
      ...apiRouteSchema({
        params: PARAMS_CHANGE_NAME,
        response: { 200: 'ChangeDetailDto' },
      }),
    },
    apiHandler(async (ctx, req) => {
      const { name } = req.params as { name: string }
      const change = await ctx.kernel.changes.repo.get(name)
      if (change === null) {
        throw new ChangeNotFoundError(name)
      }
      return toChangeDetailDto(change)
    }),
  )

  app.get(
    '/drafts/:name/status',
    {
      ...apiRouteSchema({
        params: PARAMS_CHANGE_NAME,
        querystring: STATUS_QUERY,
        response: { 200: 'ChangeStatusDto' },
      }),
    },
    apiHandler(async (ctx, req) => {
      const { name } = req.params as { name: string }
      const query = req.query as { ifModifiedSince?: string }
      const result = await ctx.kernel.changes.status.execute({
        name,
        ...(query.ifModifiedSince !== undefined ? { ifModifiedSince: query.ifModifiedSince } : {}),
      })
      return toChangeStatusDto(result)
    }),
  )

  app.get(
    '/discarded/:name/status',
    {
      ...apiRouteSchema({
        params: PARAMS_CHANGE_NAME,
        querystring: STATUS_QUERY,
        response: { 200: 'ChangeStatusDto' },
      }),
    },
    apiHandler(async (ctx, req) => {
      const { name } = req.params as { name: string }
      const query = req.query as { ifModifiedSince?: string }
      const result = await ctx.kernel.changes.status.execute({
        name,
        ...(query.ifModifiedSince !== undefined ? { ifModifiedSince: query.ifModifiedSince } : {}),
      })
      return toChangeStatusDto(result)
    }),
  )

  app.get(
    '/changes/:name/status',
    {
      ...apiRouteSchema({
        params: PARAMS_CHANGE_NAME,
        querystring: CHANGE_STATUS_QUERY,
        response: { 200: 'ChangeStatusDto' },
      }),
    },
    apiHandler(async (ctx, req) => {
      const { name } = req.params as { name: string }
      const query = req.query as {
        ifModifiedSince?: string
        refreshImplementation?: string
      }
      if (query.refreshImplementation === 'true') {
        await ctx.kernel.changes.refreshImplementationTracking.execute({ name })
      }
      const result = await ctx.kernel.changes.status.execute({
        name,
        ...(query.ifModifiedSince !== undefined ? { ifModifiedSince: query.ifModifiedSince } : {}),
      })
      return toChangeStatusDto(result)
    }),
  )

  app.get(
    '/drafts/:name/artifacts',
    {
      ...apiRouteSchema({
        params: PARAMS_CHANGE_NAME,
        response: { 200: 'ArtifactListDto' },
      }),
    },
    apiHandler(async (ctx, req) => {
      const { name } = req.params as { name: string }
      const view = await ctx.kernel.changes.repo.getDraft(name)
      if (view === null) {
        throw new ChangeNotFoundError(name)
      }
      const taskMaps = await readArtifactTaskMapsForChange(ctx, name)
      return toArtifactListDtoFromView(view, taskMaps)
    }),
  )

  app.get(
    '/discarded/:name/artifacts',
    {
      ...apiRouteSchema({
        params: PARAMS_CHANGE_NAME,
        response: { 200: 'ArtifactListDto' },
      }),
    },
    apiHandler(async (ctx, req) => {
      const { name } = req.params as { name: string }
      const view = await ctx.kernel.changes.repo.getDiscarded(name)
      if (view === null) {
        throw new ChangeNotFoundError(name)
      }
      const taskMaps = await readArtifactTaskMapsForChange(ctx, name)
      return toArtifactListDtoFromView(view, taskMaps)
    }),
  )

  app.get(
    '/changes/:name/artifacts',
    {
      ...apiRouteSchema({
        params: PARAMS_CHANGE_NAME,
        response: { 200: 'ArtifactListDto' },
      }),
    },
    apiHandler(async (ctx, req) => {
      const { name } = req.params as { name: string }
      const change = await ctx.kernel.changes.repo.get(name)
      if (change === null) {
        throw new ChangeNotFoundError(name)
      }
      const taskMaps = await readArtifactTaskMapsForChange(ctx, name)
      return toArtifactListDtoFromView(change, taskMaps)
    }),
  )

  app.get(
    '/drafts/:name/artifacts/:filename',
    {
      ...apiRouteSchema({
        params: PARAMS_CHANGE_NAME_FILENAME,
        response: { 200: 'ArtifactContentDto' },
      }),
    },
    apiHandler(async (ctx, req) => {
      const { name, filename } = req.params as { name: string; filename: string }
      const result = await ctx.kernel.changes.getReadOnlyChangeArtifact.execute({
        readOnlyOrigin: 'draft',
        name,
        filename,
      })
      return toArtifactContentDto(result)
    }),
  )

  app.get(
    '/discarded/:name/artifacts/:filename',
    {
      ...apiRouteSchema({
        params: PARAMS_CHANGE_NAME_FILENAME,
        response: { 200: 'ArtifactContentDto' },
      }),
    },
    apiHandler(async (ctx, req) => {
      const { name, filename } = req.params as { name: string; filename: string }
      const result = await ctx.kernel.changes.getReadOnlyChangeArtifact.execute({
        readOnlyOrigin: 'discarded',
        name,
        filename,
      })
      return toArtifactContentDto(result)
    }),
  )

  app.get(
    '/changes/:name/artifacts/:filename',
    {
      ...apiRouteSchema({
        params: PARAMS_CHANGE_NAME_FILENAME,
        response: { 200: 'ArtifactContentDto' },
      }),
    },
    apiHandler(async (ctx, req) => {
      const { name, filename } = req.params as { name: string; filename: string }
      const result = await ctx.kernel.changes.getArtifact.execute({ name, filename })
      return toArtifactContentDto(result)
    }),
  )

  app.get(
    '/changes/:name/context',
    {
      ...apiRouteSchema({
        params: PARAMS_CHANGE_NAME,
        querystring: COMPILE_CONTEXT_QUERY,
        response: { 200: 'CompiledContextDto' },
      }),
    },
    apiHandler(async (ctx, req) => {
      const { name } = req.params as { name: string }
      const change = await ctx.kernel.changes.repo.get(name)
      if (change === null) {
        throw new ChangeNotFoundError(name)
      }
      const query = req.query as Record<string, string | undefined>
      const includeChangeSpecs = query.includeChangeSpecs !== 'false'
      const result = await ctx.kernel.changes.compile.execute({
        name,
        step: query.step ?? resolveCompileContextStep(change.state),
        config: buildCompileContextConfig(ctx.config),
        ...(includeChangeSpecs ? { includeChangeSpecs: true } : {}),
        ...(query.followDeps === 'true' ? { followDeps: true } : {}),
        ...(query.depth !== undefined ? { depth: Number(query.depth) } : {}),
        ...(query.fingerprint !== undefined ? { fingerprint: query.fingerprint } : {}),
      })
      if (result.status === 'unchanged') {
        return {
          content: '',
          fingerprint: result.contextFingerprint,
          status: result.status,
        }
      }
      return {
        content: formatCompiledContextMarkdown(result),
        fingerprint: result.contextFingerprint,
        status: result.status,
      }
    }),
  )

  app.get(
    '/changes/:name/preview',
    {
      ...apiRouteSchema({
        params: PARAMS_CHANGE_NAME,
        querystring: {
          ...strictObjectSchema({
            required: ['specId'],
            properties: { specId: NON_EMPTY_STRING_SCHEMA },
          }),
        },
        response: { 200: 'PreviewResultDto' },
      }),
    },
    apiHandler(async (ctx, req) => {
      const { name } = req.params as { name: string }
      const query = req.query as { specId: string }
      const result = await ctx.kernel.changes.preview.execute({ name, specId: query.specId })
      return {
        specId: query.specId,
        files: result.files.map((f) => ({
          filename: f.filename,
          ...(f.base !== undefined && f.base !== null ? { base: f.base } : {}),
          ...(f.merged !== undefined ? { merged: f.merged } : {}),
        })),
      }
    }),
  )

  app.post(
    '/changes/:name/preview',
    {
      ...apiRouteSchema({
        params: PARAMS_CHANGE_NAME,
        body: 'PreviewChangeBody',
        response: { 200: 'PreviewResultDto' },
      }),
    },
    apiHandler(async (ctx, req) => {
      const { name } = req.params as { name: string }
      const body = req.body as {
        specId: string
        artifactOverrides?: Record<string, string>
      }
      const result = await ctx.kernel.changes.preview.execute({
        name,
        specId: body.specId,
        ...(body.artifactOverrides !== undefined
          ? { artifactOverrides: body.artifactOverrides }
          : {}),
      })
      return {
        specId: body.specId,
        files: result.files.map((f) => ({
          filename: f.filename,
          ...(f.base !== undefined && f.base !== null ? { base: f.base } : {}),
          ...(f.merged !== undefined ? { merged: f.merged } : {}),
        })),
      }
    }),
  )

  app.post(
    '/changes/:name/artifacts/:filename/outline',
    {
      ...apiRouteSchema({
        params: PARAMS_CHANGE_NAME_FILENAME,
        body: 'OutlineArtifactBody',
        response: { 200: 'OutlineEntryList' },
      }),
    },
    apiHandler(async (ctx, req) => {
      const { name, filename } = req.params as { name: string; filename: string }
      const body = (req.body ?? {}) as { content?: string }
      return ctx.kernel.changes.outlineArtifact.execute({
        name,
        filename,
        ...(body.content !== undefined ? { content: body.content } : {}),
      })
    }),
  )

  app.get(
    '/changes/:name/implementation-review',
    {
      ...apiRouteSchema({
        params: PARAMS_CHANGE_NAME,
        response: { 200: 'ImplementationReviewDto' },
      }),
    },
    apiHandler(async (ctx, req) => {
      const { name } = req.params as { name: string }
      const result = await ctx.kernel.changes.getImplementationReview.execute({ name })
      return toImplementationReviewDto(result)
    }),
  )

  app.get(
    '/changes/:name/hook-instructions',
    {
      ...apiRouteSchema({
        params: PARAMS_CHANGE_NAME,
        querystring: {
          ...strictObjectSchema({
            properties: {
              step: CHANGE_STATE_QUERY_SCHEMA,
              phase: { type: 'string', enum: ['pre', 'post'] },
            },
          }),
        },
        response: { 200: 'HookInstructionsDto' },
      }),
    },
    apiHandler(async (ctx, req) => {
      const { name } = req.params as { name: string }
      const query = req.query as { step?: string; phase?: string }
      return ctx.kernel.changes.getHookInstructions.execute({
        name,
        step: query.step as import('@specd/core').ChangeState,
        phase: (query.phase ?? 'pre') as 'pre' | 'post',
      })
    }),
  )

  app.get(
    '/changes/:name/artifacts/:artifactId/instruction',
    {
      ...apiRouteSchema({
        params: PARAMS_CHANGE_NAME_ARTIFACT_ID,
        response: { 200: 'ArtifactInstructionDto' },
      }),
    },
    apiHandler(async (ctx, req) => {
      const { name, artifactId } = req.params as { name: string; artifactId: string }
      return ctx.kernel.changes.getArtifactInstruction.execute({ name, artifactId })
    }),
  )
}
