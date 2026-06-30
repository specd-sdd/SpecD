import { type FastifyInstance } from 'fastify'
import { apiHandler } from '../handler-utils.js'
import { toChangeSummaryDto } from '../presenters/presenter-change.js'
import { apiRouteSchema } from '../route-schema.js'

/**
 * Registers `/v1/changes`, `/drafts`, `/discarded`, `/archived-changes` collection routes.
 * @param app
 */
export function registerChangesCollectionRoutes(app: FastifyInstance): void {
  app.get(
    '/changes',
    { ...apiRouteSchema({ response: { 200: 'ChangeSummaryList' } }) },
    apiHandler(async (ctx) => {
      const changes = await ctx.kernel.changes.list.execute()
      return changes.map((c) => toChangeSummaryDto(c))
    }),
  )

  app.get(
    '/drafts',
    { ...apiRouteSchema({ response: { 200: 'ChangeSummaryList' } }) },
    apiHandler(async (ctx) => {
      const changes = await ctx.kernel.changes.listDrafts.execute()
      return changes.map((c) => toChangeSummaryDto(c))
    }),
  )

  app.get(
    '/discarded',
    { ...apiRouteSchema({ response: { 200: 'ChangeSummaryList' } }) },
    apiHandler(async (ctx) => {
      const changes = await ctx.kernel.changes.listDiscarded.execute()
      return changes.map((c) => toChangeSummaryDto(c))
    }),
  )

  app.get(
    '/archived-changes',
    { ...apiRouteSchema({ response: { 200: 'ArchivedChangeList' } }) },
    apiHandler(async (ctx) => {
      const archived = await ctx.kernel.changes.listArchived.execute()
      return {
        items: archived.items.map((change) => ({
          name: change.name,
          archivedName: change.archivedName,
          archivedAt: change.archivedAt.toISOString(),
          ...(change.description !== undefined ? { description: change.description } : {}),
          ...(change.archivedBy !== undefined ? { archivedBy: change.archivedBy } : {}),
          specIds: [...change.specIds],
          schemaName: change.schemaName,
          schemaVersion: change.schemaVersion,
          workspaces: [...change.workspaces],
          artifacts: [...change.artifacts],
        })),
        meta: archived.meta,
      }
    }),
  )

  app.post(
    '/changes',
    {
      ...apiRouteSchema({
        body: 'CreateChangeBody',
        response: { 200: 'ChangeSummaryDto' },
      }),
    },
    apiHandler(async (ctx, req) => {
      const body = (req.body ?? {}) as {
        name?: string
        specIds?: string[]
        description?: string
        invalidationPolicy?: string
      }
      if (typeof body.name !== 'string' || body.name.length === 0) {
        throw new Error('name is required')
      }
      const { change } = await ctx.kernel.changes.create.execute({
        name: body.name,
        specIds: body.specIds ?? [],
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.invalidationPolicy !== undefined
          ? {
              invalidationPolicy: body.invalidationPolicy as
                | 'none'
                | 'surgical'
                | 'downstream'
                | 'global',
            }
          : {}),
      })
      return toChangeSummaryDto(change)
    }),
  )

  app.get(
    '/changes/overlaps',
    { ...apiRouteSchema({ response: { 200: 'ChangeOverlapsDto' } }) },
    apiHandler(async (ctx) => {
      const overlaps = await ctx.kernel.changes.detectOverlap.execute()
      return {
        hasOverlap: overlaps.hasOverlap,
        entries: overlaps.entries.map((entry) => ({
          specId: entry.specId,
          changes: entry.changes.map((c) => ({
            name: c.name,
            state: c.state,
          })),
        })),
      }
    }),
  )
}
