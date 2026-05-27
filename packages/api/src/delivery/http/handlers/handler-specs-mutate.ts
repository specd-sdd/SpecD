import { type FastifyInstance } from 'fastify'
import { apiHandler } from '../handler-utils.js'
import {
  apiRouteSchema,
  NON_EMPTY_STRING_SCHEMA,
  PARAMS_WORKSPACE,
  strictObjectSchema,
} from '../route-schema.js'

/**
 * Registers workspace spec mutate routes.
 * POST metadata on the workspace specs wildcard is handled by registerSpecsReadRoutes.
 *
 * @param app
 */
export function registerSpecsMutateRoutes(app: FastifyInstance): void {
  app.post(
    '/workspaces/:ws/specs/validate',
    {
      ...apiRouteSchema({
        params: PARAMS_WORKSPACE,
        querystring: {
          ...strictObjectSchema({
            properties: { specPath: NON_EMPTY_STRING_SCHEMA },
          }),
        },
        response: { 200: 'WorkspaceSpecsValidateResultDto' },
      }),
    },
    apiHandler(async (ctx, req) => {
      const { ws } = req.params as { ws: string }
      const query = req.query as { specPath?: string }
      const result = await ctx.kernel.specs.validate.execute({
        ...(query.specPath !== undefined ? { specPath: query.specPath } : { workspace: ws }),
      })
      return {
        passed: result.failed === 0,
        totalSpecs: result.totalSpecs,
        passedCount: result.passed,
        failedCount: result.failed,
        entries: result.entries,
      }
    }),
  )
}
