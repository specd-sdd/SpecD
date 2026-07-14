import { buildProjectStatusSnapshot } from '@specd/sdk'
import { type FastifyInstance } from 'fastify'
import { apiHandler } from '../handler-utils.js'
import { toProjectDto, toProjectStatusDtoFromSnapshot } from '../presenters/presenter-project.js'
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
      const snapshot = await buildProjectStatusSnapshot(ctx, { includeGraph: true })
      return toProjectStatusDtoFromSnapshot(snapshot, ctx.authType)
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
