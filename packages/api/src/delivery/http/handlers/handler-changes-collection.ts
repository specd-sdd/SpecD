import { type FastifyInstance } from 'fastify'
import { apiHandler } from '../handler-utils.js'
import { toChangeSummaryDto } from '../presenters/presenter-change.js'

/**
 * Registers `/v1/changes`, `/drafts`, `/discarded`, `/archived-changes` collection routes.
 * @param app
 */
export function registerChangesCollectionRoutes(app: FastifyInstance): void {
  app.get(
    '/changes',
    apiHandler(async (ctx) => {
      const changes = await ctx.kernel.changes.list.execute()
      return changes.map((c) => toChangeSummaryDto(c))
    }),
  )

  app.get(
    '/drafts',
    apiHandler(async (ctx) => {
      const changes = await ctx.kernel.changes.listDrafts.execute()
      return changes.map((c) => toChangeSummaryDto(c))
    }),
  )

  app.get(
    '/discarded',
    apiHandler(async (ctx) => {
      const changes = await ctx.kernel.changes.listDiscarded.execute()
      return changes.map((c) => toChangeSummaryDto(c))
    }),
  )

  app.get(
    '/archived-changes',
    apiHandler(async (ctx) => {
      const archived = await ctx.kernel.changes.listArchived.execute()
      return archived.map((change) => ({
        name: change.name,
        archivedName: change.archivedName,
      }))
    }),
  )

  app.post(
    '/changes',
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
      const activeSchema = await ctx.kernel.specs.getActiveSchema.execute()
      if (activeSchema.raw) {
        throw new Error('Cannot create change with raw schema reference')
      }
      const schema = activeSchema.schema
      const { change } = await ctx.kernel.changes.create.execute({
        name: body.name,
        specIds: body.specIds ?? [],
        schemaName: schema.name(),
        schemaVersion: schema.version(),
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
    apiHandler(async (ctx) => {
      const overlaps = await ctx.kernel.changes.detectOverlap.execute()
      return overlaps
    }),
  )
}
