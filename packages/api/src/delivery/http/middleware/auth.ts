import { type FastifyInstance, type FastifyRequest } from 'fastify'
import { type ApiTokenVerifier } from '../../../application/ports/api-token-verifier.js'
import { type ApiServerState, createApiContext, type ApiContext } from '../../../composition/create-api-context.js'
import { toProblemJson } from '../problem-json.js'

declare module 'fastify' {
  /**
   *
   */
  interface FastifyRequest {
    apiContext: ApiContext
  }
}

/**
 * Parses `Authorization: Bearer <token>` when present.
 *
 * @param header - Raw Authorization header value
 */
function parseBearer(header: string | undefined): string | undefined {
  if (header === undefined) {
    return undefined
  }
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match?.[1]
}

/**
 * Auth middleware: verifies token when required; attaches {@link ApiContext}.
 *
 * @param app - Fastify instance
 * @param state - Process-scoped server state
 * @param verifier - Resolved token verifier
 * @param authType - Effective `api.auth.type`
 */
export function registerAuthMiddleware(
  app: FastifyInstance,
  state: ApiServerState,
  verifier: ApiTokenVerifier,
  authType: string,
): void {
  app.addHook('onRequest', async (request: FastifyRequest, reply) => {
    try {
      const token = parseBearer(request.headers.authorization)
      const { actor } = await verifier.verify(token)
      request.apiContext = createApiContext(state, actor)
    } catch (err) {
      if (authType !== 'disabled') {
        const { status, body } = toProblemJson(err)
        return reply.status(status).type('application/problem+json').send(body)
      }
      throw err
    }
  })
}
