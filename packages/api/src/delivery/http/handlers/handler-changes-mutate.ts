import {
  type Change,
  type DraftedChangeView,
  type Kernel,
  type ValidateChangeBatchResult,
} from '@specd/core'
import { type FastifyInstance } from 'fastify'
import { type ApiContext } from '../../../composition/create-api-context.js'
import { apiHandler } from '../handler-utils.js'
import { toChangeDetailDto } from '../presenters/presenter-change.js'
import { toSaveArtifactContentDto } from '../presenters/presenter-artifact.js'
import { type ValidateBatchResultDto } from '../dto/validate-batch-result.js'
import {
  apiRouteSchema,
  NON_EMPTY_STRING_SCHEMA,
  PARAMS_CHANGE_NAME,
  PARAMS_CHANGE_NAME_FILENAME,
  strictObjectSchema,
} from '../route-schema.js'

const VALIDATE_QUERY = strictObjectSchema({
  properties: {
    specId: NON_EMPTY_STRING_SCHEMA,
    artifactId: NON_EMPTY_STRING_SCHEMA,
  },
})

/**
 * Registers mutating change routes under `/v1`.
 * @param app
 */
export function registerChangesMutateRoutes(app: FastifyInstance): void {
  app.put(
    '/changes/:name/artifacts/:filename',
    {
      ...apiRouteSchema({
        params: PARAMS_CHANGE_NAME_FILENAME,
        body: 'SaveArtifactBody',
        response: { 200: 'ArtifactContentDto' },
      }),
    },
    apiHandler(async (ctx, req) => {
      const { name, filename } = req.params as { name: string; filename: string }
      const body = (req.body ?? {}) as {
        content: string
        originalHash?: string
        force?: boolean
      }
      const actor = await ctx.actor.identity()
      const result = await ctx.kernel.changes.saveArtifact.execute({
        name,
        filename,
        content: body.content,
        originalHash: body.originalHash ?? '',
        actor,
        ...(body.force === true ? { force: true } : {}),
      })
      return toSaveArtifactContentDto(body.content, result)
    }),
  )

  app.post(
    '/changes/:name/validate',
    {
      ...apiRouteSchema({
        params: PARAMS_CHANGE_NAME,
        body: 'ValidateChangeBody',
        querystring: VALIDATE_QUERY,
        response: { 200: 'ValidateResultDto' },
      }),
    },
    apiHandler(async (ctx, req) => {
      const { name } = req.params as { name: string }
      const body = (req.body ?? {}) as { specId?: string; artifactId?: string }
      const query = req.query as { specId?: string; artifactId?: string }
      const specId = body.specId ?? query.specId
      const artifactId = body.artifactId ?? query.artifactId
      const result = await ctx.kernel.changes.validate.execute({
        name,
        ...(specId !== undefined ? { specPath: specId } : {}),
        ...(artifactId !== undefined ? { artifactId } : {}),
      })
      return {
        passed: result.passed,
        failures: result.failures.map((f) => ({
          message: f.description,
          artifactId: f.artifactId,
          ...(f.filename !== undefined ? { path: f.filename } : {}),
        })),
        warnings: result.warnings.map((w) => w.description),
        files: result.files.map((f) => f.filename),
      }
    }),
  )

  app.post(
    '/changes/:name/validate-all',
    {
      ...apiRouteSchema({
        params: PARAMS_CHANGE_NAME,
        body: 'ValidateBatchBody',
        querystring: {
          ...strictObjectSchema({
            properties: { artifactId: NON_EMPTY_STRING_SCHEMA },
          }),
        },
        response: { 200: 'ValidateBatchResultDto' },
      }),
    },
    apiHandler(async (ctx, req) => {
      const { name } = req.params as { name: string }
      const body = (req.body ?? {}) as { artifactId?: string }
      const query = req.query as { artifactId?: string }
      const artifactId = body.artifactId ?? query.artifactId
      const result = await ctx.kernel.changes.validateBatch.execute({
        name,
        ...(artifactId !== undefined ? { artifactId } : {}),
      })
      return toValidateBatchResultDto(result)
    }),
  )

  app.post(
    '/changes/:name/transition',
    {
      ...apiRouteSchema({
        params: PARAMS_CHANGE_NAME,
        body: 'TransitionChangeBody',
        response: { 200: 'ChangeDetailDto' },
      }),
    },
    apiHandler(async (ctx, req) => {
      const { name } = req.params as { name: string }
      const body = (req.body ?? {}) as { to?: string; skipHookPhases?: string[] }
      const result = await ctx.kernel.changes.transition.execute({
        name,
        to: body.to as import('@specd/core').ChangeState,
        approvalsSpec: ctx.config.approvals.spec,
        approvalsSignoff: ctx.config.approvals.signoff,
        ...(body.skipHookPhases !== undefined
          ? {
              skipHookPhases: new Set(
                body.skipHookPhases as import('@specd/core').HookPhaseSelector[],
              ),
            }
          : {}),
      })
      return toChangeDetailDto(result.change)
    }),
  )

  app.post(
    '/changes/:name/draft',
    {
      ...apiRouteSchema({
        params: PARAMS_CHANGE_NAME,
        response: { 200: 'ChangeDetailDto' },
      }),
    },
    mutateSimple((k, n) => k.changes.draft.execute({ name: n })),
  )
  app.post(
    '/changes/:name/restore',
    {
      ...apiRouteSchema({
        params: PARAMS_CHANGE_NAME,
        response: { 200: 'ChangeDetailDto' },
      }),
    },
    mutateSimple((k, n) => k.changes.restore.execute({ name: n })),
  )
  app.post(
    '/changes/:name/discard',
    {
      ...apiRouteSchema({
        params: PARAMS_CHANGE_NAME,
        body: 'ReasonBody',
        response: { 200: 'ChangeDetailDto' },
      }),
    },
    apiHandler(async (ctx, req) => {
      const { name } = req.params as { name: string }
      const body = (req.body ?? {}) as { reason?: string }
      const change = await ctx.kernel.changes.discard.execute({
        name,
        reason: body.reason ?? 'discarded via api',
      })
      return toChangeDetailDto(change)
    }),
  )
  app.post(
    '/changes/:name/archive',
    {
      ...apiRouteSchema({
        params: PARAMS_CHANGE_NAME,
        response: { 200: 'ArchiveChangeResultDto' },
      }),
    },
    apiHandler(async (ctx, req) => {
      const { name } = req.params as { name: string }
      const result = await ctx.kernel.changes.archive.execute({ name })
      return {
        archivedChange: result.archivedChange.name,
        archiveDirPath: result.archiveDirPath,
        postHookFailures: result.postHookFailures,
      }
    }),
  )

  app.post(
    '/changes/:name/approve-spec',
    {
      ...apiRouteSchema({
        params: PARAMS_CHANGE_NAME,
        body: 'ReasonBody',
        response: { 200: 'ChangeDetailDto' },
      }),
    },
    apiHandler(async (ctx, req) => {
      const { name } = req.params as { name: string }
      const body = (req.body ?? {}) as { reason?: string }
      const change = await ctx.kernel.specs.approveSpec.execute({
        name,
        reason: body.reason ?? '',
        approvalsSpec: ctx.config.approvals.spec,
      })
      return toChangeDetailDto(change)
    }),
  )

  app.post(
    '/changes/:name/approve-signoff',
    {
      ...apiRouteSchema({
        params: PARAMS_CHANGE_NAME,
        body: 'ReasonBody',
        response: { 200: 'ChangeDetailDto' },
      }),
    },
    apiHandler(async (ctx, req) => {
      const { name } = req.params as { name: string }
      const body = (req.body ?? {}) as { reason?: string }
      const change = await ctx.kernel.specs.approveSignoff.execute({
        name,
        reason: body.reason ?? '',
        approvalsSignoff: ctx.config.approvals.signoff,
      })
      return toChangeDetailDto(change)
    }),
  )

  app.post(
    '/changes/:name/invalidate',
    {
      ...apiRouteSchema({
        params: PARAMS_CHANGE_NAME,
        body: 'InvalidateBody',
        response: { 200: 'ChangeDetailDto' },
      }),
    },
    apiHandler(async (ctx, req) => {
      const { name } = req.params as { name: string }
      const body = (req.body ?? {}) as { reason?: string; force?: boolean }
      const result = await ctx.kernel.changes.invalidate.execute({
        name,
        reason: body.reason ?? 'api invalidate',
        ...(body.force === true ? { force: true } : {}),
      })
      return toChangeDetailDto(result.change)
    }),
  )

  app.post(
    '/changes/:name/skip-artifact',
    {
      ...apiRouteSchema({
        params: PARAMS_CHANGE_NAME,
        body: 'SkipArtifactBody',
        response: { 200: 'ChangeDetailDto' },
      }),
    },
    apiHandler(async (ctx, req) => {
      const { name } = req.params as { name: string }
      const body = (req.body ?? {}) as { artifactId: string }
      const change = await ctx.kernel.changes.skipArtifact.execute({
        name,
        artifactId: body.artifactId,
      })
      return toChangeDetailDto(change)
    }),
  )

  app.patch(
    '/changes/:name',
    {
      ...apiRouteSchema({
        params: PARAMS_CHANGE_NAME,
        body: 'PatchChangeBody',
        response: { 200: 'ChangeDetailDto' },
      }),
    },
    apiHandler(async (ctx, req) => {
      const { name } = req.params as { name: string }
      const body = (req.body ?? {}) as {
        description?: string
        addSpecIds?: string[]
        removeSpecIds?: string[]
        invalidationPolicy?: string
      }
      const result = await ctx.kernel.changes.edit.execute({
        name,
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.addSpecIds !== undefined ? { addSpecIds: body.addSpecIds } : {}),
        ...(body.removeSpecIds !== undefined ? { removeSpecIds: body.removeSpecIds } : {}),
        ...(body.invalidationPolicy !== undefined
          ? {
              invalidationPolicy:
                body.invalidationPolicy as import('@specd/core').InvalidationPolicy,
            }
          : {}),
      })
      return toChangeDetailDto(result.change)
    }),
  )

  app.patch(
    '/changes/:name/spec-ids',
    {
      ...apiRouteSchema({
        params: PARAMS_CHANGE_NAME,
        body: 'PatchSpecIdsBody',
        response: { 200: 'ChangeDetailDto' },
      }),
    },
    apiHandler(async (ctx, req) => {
      const { name } = req.params as { name: string }
      const body = (req.body ?? {}) as { add?: string[]; remove?: string[] }
      const result = await ctx.kernel.changes.edit.execute({
        name,
        ...(body.add !== undefined ? { addSpecIds: body.add } : {}),
        ...(body.remove !== undefined ? { removeSpecIds: body.remove } : {}),
      })
      return toChangeDetailDto(result.change)
    }),
  )

  app.patch(
    '/changes/:name/spec-dependencies',
    {
      ...apiRouteSchema({
        params: PARAMS_CHANGE_NAME,
        body: 'PatchSpecDependenciesBody',
        response: { 200: 'UpdateSpecDepsResultDto' },
      }),
    },
    apiHandler(async (ctx, req) => {
      const { name } = req.params as { name: string }
      const body = (req.body ?? {}) as {
        specId?: string
        add?: string[]
        remove?: string[]
        set?: string[]
      }
      const result = await ctx.kernel.changes.updateSpecDeps.execute({
        name,
        specId: body.specId!,
        ...(body.add !== undefined ? { add: body.add } : {}),
        ...(body.remove !== undefined ? { remove: body.remove } : {}),
        ...(body.set !== undefined ? { set: body.set } : {}),
      })
      return result
    }),
  )

  app.patch(
    '/changes/:name/implementation-tracking',
    {
      ...apiRouteSchema({
        params: PARAMS_CHANGE_NAME,
        body: 'UpdateImplementationTrackingBody',
        response: { 200: 'JsonObjectDto' },
      }),
    },
    apiHandler(async (ctx, req) => {
      const { name } = req.params as { name: string }
      const body = req.body as Record<string, unknown>
      const result = await ctx.kernel.changes.updateImplementationTracking.execute({
        name,
        ...body,
      } as Parameters<typeof ctx.kernel.changes.updateImplementationTracking.execute>[0])
      return result
    }),
  )
}

/**
 * Maps a core batch validation result to the HTTP DTO.
 *
 * @param result - Use-case batch result
 * @returns API response body
 */
function toValidateBatchResultDto(result: ValidateChangeBatchResult): ValidateBatchResultDto {
  return {
    passed: result.passed,
    total: result.total,
    results: result.results.map((step) => ({
      spec: step.spec,
      artifact: step.artifact,
      passed: step.passed,
      failures: step.failures.map((f) => ({
        message: f.description,
        artifactId: f.artifactId,
        ...(f.filename !== undefined ? { path: f.filename } : {}),
      })),
      warnings: step.warnings.map((w) => w.description),
      files: step.files.map((f) => f.filename),
    })),
  }
}

function mutateSimple(run: (kernel: Kernel, name: string) => Promise<Change | DraftedChangeView>) {
  return apiHandler(async (ctx: ApiContext, req) => {
    const { name } = req.params as { name: string }
    const change = await run(ctx.kernel, name)
    return toChangeDetailDto(change)
  })
}
