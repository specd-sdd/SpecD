import { ChangeNotFoundError } from '@specd/core'
import { buildCompileContextConfig } from '../compile-config.js'
import {
  formatCompiledContextMarkdown,
  resolveCompileContextStep,
} from '../format-compiled-context.js'
import { type FastifyInstance } from 'fastify'
import { apiHandler } from '../handler-utils.js'
import {
  toArtifactListDto,
  toChangeDetailDto,
  toChangeStatusDto,
} from '../presenters/presenter-change.js'
import {
  toArtifactContentDto,
} from '../presenters/presenter-artifact.js'
import { toImplementationReviewDto } from '../presenters/presenter-change.js'

/**
 * Registers read routes for a single change under `/v1`.
 * @param app
 */
export function registerChangesReadRoutes(app: FastifyInstance): void {
  app.get(
    '/changes/:name',
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
    '/changes/:name/status',
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
        ...(query.ifModifiedSince !== undefined
          ? { ifModifiedSince: query.ifModifiedSince }
          : {}),
      })
      return toChangeStatusDto(result)
    }),
  )

  app.get(
    '/changes/:name/artifacts',
    apiHandler(async (ctx, req) => {
      const { name } = req.params as { name: string }
      const change = await ctx.kernel.changes.repo.get(name)
      if (change === null) {
        throw new ChangeNotFoundError(name)
      }
      return toArtifactListDto(change)
    }),
  )

  app.get(
    '/changes/:name/artifacts/:filename',
    apiHandler(async (ctx, req) => {
      const { name, filename } = req.params as { name: string; filename: string }
      const result = await ctx.kernel.changes.getArtifact.execute({ name, filename })
      return toArtifactContentDto(result)
    }),
  )

  app.get(
    '/changes/:name/context',
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
    apiHandler(async (ctx, req) => {
      const { name } = req.params as { name: string }
      const query = req.query as { specId?: string }
      if (query.specId === undefined) {
        throw new Error('specId query parameter is required')
      }
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
    apiHandler(async (ctx, req) => {
      const { name } = req.params as { name: string }
      const body = req.body as {
        specId?: string
        artifactOverrides?: Record<string, string>
      }
      if (body.specId === undefined) {
        throw new Error('specId is required in request body')
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
    apiHandler(async (ctx, req) => {
      const { name } = req.params as { name: string }
      const result = await ctx.kernel.changes.getImplementationReview.execute({ name })
      return toImplementationReviewDto(result)
    }),
  )

  app.get(
    '/changes/:name/hook-instructions',
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
    apiHandler(async (ctx, req) => {
      const { name, artifactId } = req.params as { name: string; artifactId: string }
      return ctx.kernel.changes.getArtifactInstruction.execute({ name, artifactId })
    }),
  )
}
