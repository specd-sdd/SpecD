import { type FastifyReply, type FastifyRequest } from 'fastify'
import { type ApiContext } from '../../composition/create-api-context.js'
import { toProblemJson } from './problem-json.js'

/**
 *
 */
export type ApiRouteHandler = (
  ctx: ApiContext,
  request: FastifyRequest,
  reply: FastifyReply,
) => Promise<unknown>

/**
 * Wraps a handler with problem+json error mapping.
 *
 * @param handler - Route handler using {@link ApiContext}
 */
export function apiHandler(handler: ApiRouteHandler) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const result = await handler(request.apiContext, request, reply)
      if (result !== undefined && !reply.sent) {
        await reply.send(result)
      }
    } catch (err) {
      const { status, body } = toProblemJson(err)
      await reply.status(status).type('application/problem+json').send(body)
    }
  }
}
