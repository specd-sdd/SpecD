import cors from '@fastify/cors'
import { type FastifyInstance } from 'fastify'
import { type SpecdConfig } from '@specd/sdk'

/**
 * Merges configured and runtime CORS origins (deduplicated).
 *
 * @param configOrigins - Origins from `specd.yaml` `api.cors.origins`.
 * @param extraOrigins - CLI/runtime additions (e.g. Vite UI origin during `ui serve`).
 * @returns Combined origin list.
 */
export function mergeCorsOrigins(
  configOrigins: readonly string[] | undefined,
  extraOrigins: readonly string[] | undefined,
): readonly string[] {
  return [...new Set([...(configOrigins ?? []), ...(extraOrigins ?? [])])]
}

/**
 * Registers CORS from `specd.yaml` `api.cors.origins` plus optional extras.
 *
 * @param app - Fastify instance
 * @param config - Project configuration
 * @param extraOrigins - Additional allowed origins for this process
 */
export async function registerCorsMiddleware(
  app: FastifyInstance,
  config: SpecdConfig,
  extraOrigins?: readonly string[],
): Promise<void> {
  const origins = mergeCorsOrigins(config.api?.cors?.origins, extraOrigins)
  await app.register(cors, {
    origin: origins.length > 0 ? [...origins] : false,
  })
}
