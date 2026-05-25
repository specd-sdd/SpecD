import { type Change, type Kernel, type ValidateChangeBatchResult } from '@specd/core'
import { type FastifyInstance } from 'fastify'
import { type ApiContext } from '../../../composition/create-api-context.js'
import { apiHandler } from '../handler-utils.js'
import { toChangeDetailDto } from '../presenters/presenter-change.js'
import { toSaveArtifactContentDto } from '../presenters/presenter-artifact.js'
import { type ValidateBatchResultDto } from '../dto/validate-batch-result.js'

/**
 * Registers mutating change routes under `/v1`.
 * @param app
 */
export function registerChangesMutateRoutes(app: FastifyInstance): void {
  app.put(
    '/changes/:name/artifacts/:filename',
    apiHandler(async (ctx, req) => {
      const { name, filename } = req.params as { name: string; filename: string }
      const body = (req.body ?? {}) as {
        content?: string
        originalHash?: string
        force?: boolean
      }
      if (typeof body.content !== 'string') {
        throw new Error('content is required')
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
    apiHandler(async (ctx, req) => {
      const { name } = req.params as { name: string }
      const body = (req.body ?? {}) as { specId?: string; artifactId?: string }
      const query = req.query as { specId?: string; artifactId?: string }
      const result = await ctx.kernel.changes.validate.execute({
        name,
        ...(body.specId ?? query.specId !== undefined
          ? { specPath: body.specId ?? query.specId }
          : {}),
        ...(body.artifactId ?? query.artifactId !== undefined
          ? { artifactId: body.artifactId ?? query.artifactId }
          : {}),
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
    apiHandler(async (ctx, req) => {
      const { name } = req.params as { name: string }
      const body = (req.body ?? {}) as { to?: string; skipHookPhases?: string[] }
      if (typeof body.to !== 'string') {
        throw new Error('to is required')
      }
      const result = await ctx.kernel.changes.transition.execute({
        name,
        to: body.to as import('@specd/core').ChangeState,
        approvalsSpec: ctx.config.approvals.spec,
        approvalsSignoff: ctx.config.approvals.signoff,
        ...(body.skipHookPhases !== undefined
          ? { skipHookPhases: new Set(body.skipHookPhases as import('@specd/core').HookPhaseSelector[]) }
          : {}),
      })
      return toChangeDetailDto(result.change)
    }),
  )

  app.post('/changes/:name/draft', mutateSimple((k, n) => k.changes.draft.execute({ name: n })))
  app.post('/changes/:name/restore', mutateSimple((k, n) => k.changes.restore.execute({ name: n })))
  app.post(
    '/changes/:name/discard',
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
    apiHandler(async (ctx, req) => {
      const { name } = req.params as { name: string }
      const body = (req.body ?? {}) as { artifactId?: string }
      const change = await ctx.kernel.changes.skipArtifact.execute({
        name,
        artifactId: body.artifactId ?? '',
      })
      return toChangeDetailDto(change)
    }),
  )

  app.patch(
    '/changes/:name',
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
    apiHandler(async (ctx, req) => {
      const { name } = req.params as { name: string }
      const body = (req.body ?? {}) as {
        specId?: string
        add?: string[]
        remove?: string[]
        set?: string[]
      }
      if (body.specId === undefined) {
        throw new Error('specId is required')
      }
      const result = await ctx.kernel.changes.updateSpecDeps.execute({
        name,
        specId: body.specId,
        ...(body.add !== undefined ? { add: body.add } : {}),
        ...(body.remove !== undefined ? { remove: body.remove } : {}),
        ...(body.set !== undefined ? { set: body.set } : {}),
      })
      return result
    }),
  )

  app.patch(
    '/changes/:name/implementation-tracking',
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
 *
 * @param run
 */
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

function mutateSimple(
  run: (kernel: Kernel, name: string) => Promise<Change>,
) {
  return apiHandler(async (ctx: ApiContext, req) => {
    const { name } = req.params as { name: string }
    const change = await run(ctx.kernel, name)
    return toChangeDetailDto(change)
  })
}
