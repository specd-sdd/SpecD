import { createVcsAdapter } from '@specd/core'
import { type FastifyInstance } from 'fastify'
import { apiHandler } from '../handler-utils.js'
import { toProjectDto, toProjectStatusDto } from '../presenters/presenter-project.js'
import {
  apiRouteSchema,
  BOOLEAN_QUERY_SCHEMA,
  POSITIVE_INTEGER_QUERY_SCHEMA,
  strictObjectSchema,
} from '../route-schema.js'

/**
 * Registers `/v1/project*` routes.
 * @param app
 */
export function registerProjectRoutes(app: FastifyInstance): void {
  app.get(
    '/project',
    { ...apiRouteSchema({ response: { 200: 'ProjectDto' } }) },
    apiHandler((ctx) => Promise.resolve(toProjectDto(ctx.config))),
  )

  app.get(
    '/project/status',
    { ...apiRouteSchema({ response: { 200: 'ProjectStatusDto' } }) },
    apiHandler(async (ctx) => {
      const [active, drafts, discarded, archived, specs] = await Promise.all([
        ctx.kernel.changes.list.execute(),
        ctx.kernel.changes.listDrafts.execute(),
        ctx.kernel.changes.listDiscarded.execute(),
        ctx.kernel.changes.listArchived.execute(),
        ctx.kernel.specs.list.execute({ includeSummary: false }),
      ])

      const specsByWorkspace: Record<string, number> = {}
      for (const s of specs) {
        specsByWorkspace[s.workspace] = (specsByWorkspace[s.workspace] ?? 0) + 1
      }

      let graphStats = null
      let graphStale: boolean | null = null
      const fingerprintMismatch: boolean | null = null
      try {
        const provider = ctx.createGraphProvider()
        await provider.open()
        try {
          graphStats = await provider.getStatistics()
          let currentRef: string | null = null
          try {
            const vcs = await createVcsAdapter(ctx.config.projectRoot)
            currentRef = await vcs.ref()
          } catch {
            // no vcs
          }
          if (graphStats.lastIndexedRef !== null && currentRef !== null) {
            graphStale = graphStats.lastIndexedRef !== currentRef
          } else if (graphStats.lastIndexedAt !== undefined && graphStats.lastIndexedAt !== null) {
            graphStale =
              Date.now() - new Date(graphStats.lastIndexedAt).getTime() > 24 * 60 * 60 * 1000
          }
        } finally {
          await provider.close()
        }
      } catch {
        graphStats = null
      }

      return toProjectStatusDto({
        activeCount: active.length,
        draftCount: drafts.length,
        discardedCount: discarded.length,
        archivedCount: archived.meta.total,
        specsByWorkspace,
        graphStats,
        graphStale,
        fingerprintMismatch,
        config: ctx.config,
      })
    }),
  )

  app.get(
    '/project/context',
    {
      ...apiRouteSchema({
        querystring: {
          ...strictObjectSchema({
            properties: {
              followDeps: BOOLEAN_QUERY_SCHEMA,
              depth: POSITIVE_INTEGER_QUERY_SCHEMA,
            },
          }),
        },
        response: { 200: 'ProjectContextDto' },
      }),
    },
    apiHandler(async (ctx, req) => {
      const query = req.query as {
        followDeps?: string
        depth?: string
      }
      const result = await ctx.kernel.project.getProjectContext.execute({
        ...(query.followDeps === 'true' ? { followDeps: true } : {}),
        ...(query.depth !== undefined ? { depth: Number(query.depth) } : {}),
      })
      const parts = [...result.contextEntries]
      for (const spec of result.specs) {
        if (spec.content !== undefined) {
          parts.push(spec.content)
        }
      }
      return { content: parts.join('\n\n'), warnings: result.warnings }
    }),
  )

  app.get(
    '/project/schema',
    { ...apiRouteSchema({ response: { 200: 'ProjectSchemaDto' } }) },
    apiHandler(async (ctx) => {
      const result = await ctx.kernel.specs.getActiveSchema.execute()
      if (result.raw) {
        return { raw: true, schemaRef: ctx.config.schemaRef }
      }
      const schema = result.schema
      return {
        name: schema.name(),
        version: schema.version(),
        artifacts: schema.artifacts().map((a) => ({ id: a.id, scope: a.scope })),
      }
    }),
  )

  app.post(
    '/project/schema/validate',
    { ...apiRouteSchema({ response: { 200: 'SchemaValidateResultDto' } }) },
    apiHandler(async (ctx) => {
      const result = await ctx.kernel.specs.validateSchema.execute({ mode: 'project' })
      return {
        valid: result.valid,
        errors: 'errors' in result ? result.errors : [],
        warnings: 'warnings' in result ? result.warnings : [],
      }
    }),
  )
}
