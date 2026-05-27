import { type ArchivedChange } from '@specd/core'
import { type FastifyInstance } from 'fastify'
import { apiHandler } from '../handler-utils.js'
import { apiRouteSchema, PARAMS_CHANGE_NAME } from '../route-schema.js'

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
      return toArchivedChangeDto(archived)
    }),
  )
}

function toArchivedChangeDto(change: ArchivedChange) {
  return {
    name: change.name,
    archivedName: change.archivedName,
    archivedAt: change.archivedAt.toISOString(),
    specIds: [...change.specIds],
    schemaName: change.schemaName,
    schemaVersion: change.schemaVersion,
    artifacts: [...change.artifacts],
  }
}
