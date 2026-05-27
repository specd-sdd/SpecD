import { type FastifyInstance } from 'fastify'
import { registerArchivedChangesRoutes } from './handlers/handler-archived-changes.js'
import { registerChangesCollectionRoutes } from './handlers/handler-changes-collection.js'
import { registerChangesMutateRoutes } from './handlers/handler-changes-mutate.js'
import { registerChangesReadRoutes } from './handlers/handler-changes-read.js'
import { registerGraphRoutes } from './handlers/handler-graph.js'
import { registerProjectRoutes } from './handlers/handler-project.js'
import { registerProjectLogsRoutes } from './handlers/handler-project-logs.js'
import { registerSpecsMutateRoutes } from './handlers/handler-specs-mutate.js'
import { registerSpecsReadRoutes } from './handlers/handler-specs-read.js'
import { registerWorkspacesRoutes } from './handlers/handler-workspaces.js'
import { apiHandler } from './handler-utils.js'
import { apiRouteSchema } from './route-schema.js'

/**
 * Registers all `/v1` API routes on the given Fastify instance.
 * @param app
 */
export function registerV1Routes(app: FastifyInstance): void {
  app.get(
    '/health',
    {
      ...apiRouteSchema({ response: { 200: 'HealthDto' } }),
    },
    apiHandler((ctx) =>
      Promise.resolve({
        status: 'ok' as const,
        auth: { type: ctx.authType },
      }),
    ),
  )

  registerProjectRoutes(app)
  registerProjectLogsRoutes(app)
  registerChangesCollectionRoutes(app)
  registerChangesReadRoutes(app)
  registerChangesMutateRoutes(app)
  registerArchivedChangesRoutes(app)
  registerWorkspacesRoutes(app)
  registerSpecsReadRoutes(app)
  registerSpecsMutateRoutes(app)
  registerGraphRoutes(app)
}
