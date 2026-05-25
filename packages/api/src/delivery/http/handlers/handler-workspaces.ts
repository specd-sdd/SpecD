import { type FastifyInstance } from 'fastify'
import { apiHandler } from '../handler-utils.js'
import { toWorkspaceSpecTreeDto } from '../presenters/presenter-spec.js'
import { type WorkspaceDto } from '../dto/workspace.js'

/**
 * Registers workspace routes under `/v1`.
 * @param app
 */
export function registerWorkspacesRoutes(app: FastifyInstance): void {
  app.get(
    '/workspaces',
    apiHandler((ctx) => {
      const workspaces: WorkspaceDto[] = ctx.config.workspaces.map((w) => ({
        name: w.name,
        ...(w.prefix !== undefined ? { prefix: w.prefix } : {}),
        ...(w.ownership !== undefined ? { ownership: w.ownership } : {}),
        specsPath: w.specsPath,
        codeRoots: [w.codeRoot],
      }))
      return Promise.resolve(workspaces)
    }),
  )

  app.get(
    '/workspaces/:ws/specs',
    apiHandler(async (ctx, req) => {
      const { ws } = req.params as { ws: string }
      const all = await ctx.kernel.specs.list.execute({ includeSummary: true })
      const filtered = all.filter((s) => s.workspace === ws)
      return toWorkspaceSpecTreeDto(ws, filtered)
    }),
  )
}
