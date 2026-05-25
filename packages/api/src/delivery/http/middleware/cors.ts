import cors from '@fastify/cors'
import { type FastifyInstance } from 'fastify'
import { type SpecdConfig } from '@specd/core'

/**
 * Registers CORS from `specd.yaml` `api.cors.origins`.
 *
 * @param app - Fastify instance
 * @param config - Project configuration
 */
export async function registerCorsMiddleware(
  app: FastifyInstance,
  config: SpecdConfig,
): Promise<void> {
  const origins = config.api?.cors?.origins
  await app.register(cors, {
    origin: origins !== undefined && origins.length > 0 ? [...origins] : false,
  })
}
