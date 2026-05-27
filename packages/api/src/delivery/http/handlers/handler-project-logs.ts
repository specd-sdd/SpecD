import { Logger } from '@specd/core'
import { type FastifyInstance } from 'fastify'
import { apiHandler } from '../handler-utils.js'
import type { LogReadDto } from '../dto/log-read.js'
import type { StudioOutputListDto } from '../dto/studio-output.js'
import type { StudioOutputLevel } from '../../../infrastructure/studio-output-buffer.js'
import {
  apiRouteSchema,
  BOOLEANISH_QUERY_SCHEMA,
  POSITIVE_INTEGER_QUERY_SCHEMA,
  strictObjectSchema,
} from '../route-schema.js'

function parseLimit(raw: string | undefined, fallback: number, max: number): number {
  if (raw === undefined || raw === '') {
    return fallback
  }
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 1) {
    return fallback
  }
  return Math.min(n, max)
}

/**
 * Registers `/v1/logs` and `/v1/studio/output` routes.
 * @param app
 */
export function registerProjectLogsRoutes(app: FastifyInstance): void {
  app.get(
    '/logs',
    {
      ...apiRouteSchema({
        querystring: {
          ...strictObjectSchema({
            properties: {
              limit: POSITIVE_INTEGER_QUERY_SCHEMA,
              prettier: BOOLEANISH_QUERY_SCHEMA,
            },
          }),
        },
        response: { 200: 'LogReadDto' },
      }),
    },
    apiHandler((ctx, req) => {
      const read = ctx.kernel.logs?.read
      if (read === undefined) {
        throw new Error('Log ring is not configured on this server')
      }
      const query = req.query as { limit?: string; prettier?: string }
      const limit = parseLimit(query.limit, 500, 500)
      const prettier = query.prettier === 'true' || query.prettier === '1'
      const result = read.execute({ limit, prettier })
      return Promise.resolve(result as LogReadDto)
    }),
  )

  app.post(
    '/logs',
    {
      ...apiRouteSchema({
        body: 'AppendLogBody',
        response: { 200: 'OkDto' },
      }),
    },
    apiHandler((ctx, req) => {
      const body = req.body as {
        level?: string
        message: string
        context?: Record<string, unknown>
      }
      const level = body.level ?? 'debug'
      const message = body.message?.trim()
      const context = body.context ?? {}
      const log = Logger.child({ source: 'studio' })
      switch (level) {
        case 'debug':
          log.debug(message, context)
          break
        case 'info':
          log.info(message, context)
          break
        case 'warn':
          log.warn(message, context)
          break
        case 'error':
          log.error(message, context)
          break
        default:
          break
      }
      return Promise.resolve({ ok: true as const })
    }),
  )

  app.get(
    '/studio/output',
    {
      ...apiRouteSchema({
        querystring: {
          ...strictObjectSchema({
            properties: { limit: POSITIVE_INTEGER_QUERY_SCHEMA },
          }),
        },
        response: { 200: 'StudioOutputListDto' },
      }),
    },
    apiHandler((ctx, req) => {
      const query = req.query as { limit?: string }
      const limit = parseLimit(query.limit, 200, 500)
      const entries = ctx.studioOutput.list(limit)
      return Promise.resolve({ entries } satisfies StudioOutputListDto)
    }),
  )

  app.post(
    '/studio/output',
    {
      ...apiRouteSchema({
        body: 'AppendStudioOutputBody',
        response: { 200: 'StudioOutputEntryDto' },
      }),
    },
    apiHandler((ctx, req) => {
      const body = req.body as {
        level?: string
        message: string
        action?: string
        context?: Record<string, unknown>
      }
      const level = (body.level ?? 'info') as StudioOutputLevel
      const message = body.message?.trim()
      const entry = ctx.studioOutput.append({
        level,
        message,
        ...(body.action !== undefined ? { action: body.action } : {}),
        ...(body.context !== undefined ? { context: body.context } : {}),
      })
      return Promise.resolve(entry)
    }),
  )
}
