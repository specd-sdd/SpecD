import { Logger, type LogLevel } from '@specd/core'
import { type FastifyInstance } from 'fastify'
import { apiHandler } from '../handler-utils.js'
import type { LogReadDto } from '../dto/log-read.js'
import type { StudioOutputListDto } from '../dto/studio-output.js'
import type { StudioOutputLevel } from '../../../infrastructure/studio-output-buffer.js'

const STUDIO_LOG_LEVELS = new Set<LogLevel>(['debug', 'info', 'warn', 'error'])
const STUDIO_OUTPUT_LEVELS = new Set<StudioOutputLevel>(['debug', 'info', 'warn', 'error'])

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
    apiHandler((ctx, req) => {
      const body = req.body as {
        level?: string
        message?: string
        context?: Record<string, unknown>
      }
      const level = body.level ?? 'debug'
      if (!STUDIO_LOG_LEVELS.has(level as LogLevel)) {
        throw new Error(`Invalid log level: ${level}`)
      }
      const message = body.message?.trim()
      if (message === undefined || message === '') {
        throw new Error('message is required')
      }
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
    apiHandler((ctx, req) => {
      const query = req.query as { limit?: string }
      const limit = parseLimit(query.limit, 200, 500)
      const entries = ctx.studioOutput.list(limit)
      return Promise.resolve({ entries } satisfies StudioOutputListDto)
    }),
  )

  app.post(
    '/studio/output',
    apiHandler((ctx, req) => {
      const body = req.body as {
        level?: string
        message?: string
        action?: string
        context?: Record<string, unknown>
      }
      const level = (body.level ?? 'info') as StudioOutputLevel
      if (!STUDIO_OUTPUT_LEVELS.has(level)) {
        throw new Error(`Invalid studio output level: ${body.level}`)
      }
      const message = body.message?.trim()
      if (message === undefined || message === '') {
        throw new Error('message is required')
      }
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
