import { type FastifyInstance } from 'fastify'
import { apiHandler } from '../handler-utils.js'
import { toWorkspaceSpecTreeDto } from '../presenters/presenter-spec.js'
import { type WorkspaceDto } from '../dto/workspace.js'
import { apiRouteSchema, PARAMS_WORKSPACE } from '../route-schema.js'

/**
 * Registers workspace routes under `/v1`.
 * @param app
 */
export function registerWorkspacesRoutes(app: FastifyInstance): void {
  app.get(
    '/workspaces',
    { ...apiRouteSchema({ response: { 200: 'WorkspaceList' } }) },
    apiHandler(async (ctx) => {
      const workspaces = await ctx.kernel.project.listWorkspaces.execute()
      const descriptors = new Map(ctx.config.workspaces.map((workspace) => [workspace.name, workspace]))
      return workspaces.map((workspace): WorkspaceDto => {
        const descriptor = descriptors.get(workspace.name)
        return {
          name: workspace.name,
          ...(descriptor?.prefix !== undefined ? { prefix: descriptor.prefix } : {}),
          ownership: workspace.ownership,
          specsPath: descriptor?.specsPath ?? '',
          codeRoots: [workspace.codeRoot],
        }
      })
    }),
  )

  app.get(
    '/workspaces/:ws/specs',
    {
      ...apiRouteSchema({
        params: PARAMS_WORKSPACE,
        response: { 200: 'WorkspaceSpecTreeDto' },
      }),
    },
    apiHandler(async (ctx, req) => {
      const { ws } = req.params as { ws: string }
      const all = await ctx.kernel.specs.list.execute({ includeSummary: true })
      const filtered = all.filter((s) => s.workspace === ws)
      return toWorkspaceSpecTreeDto(ws, filtered)
    }),
  )
}
