import fs from 'node:fs'
import path from 'node:path'
import fastifyStatic from '@fastify/static'
import fastifySwagger from '@fastify/swagger'
import Fastify, { type FastifyInstance } from 'fastify'
import {
  createConfigLoader,
  createKernel,
  createLogFormatter,
  LogRingBuffer,
  type SpecdConfig,
} from '@specd/core'
import { StudioOutputBuffer } from '../infrastructure/studio-output-buffer.js'
import { type AuthAdapterRegistry } from '../application/auth/auth-adapter-registry.js'
import { defaultAuthAdapterRegistry } from './default-auth-registry.js'
import { registerAuthMiddleware } from '../delivery/http/middleware/auth.js'
import { registerCorsMiddleware } from '../delivery/http/middleware/cors.js'
import { registerV1Routes } from '../delivery/http/register-routes.js'
import { registerApiOpenApiSchemas } from '../delivery/http/openapi-schemas.js'
import { toProblemJson } from '../delivery/http/problem-json.js'
import { resolveKernelActor, type ApiServerState } from './create-api-context.js'

/** Options for {@link createApiServer}. */
export interface CreateApiServerOptions {
  /** Project root directory containing `specd.yaml`. */
  readonly projectRoot: string
  readonly host?: string
  readonly port?: number
  /** Override effective auth (defaults to `specd.yaml` `api.auth`). */
  readonly auth?: { readonly type: 'disabled'; readonly config?: Record<string, unknown> }
  /** Injectable registry for tests. */
  readonly authRegistry?: AuthAdapterRegistry
  /** Built `@specd/ui` dist for SPA hosting at `/`. */
  readonly uiDistPath?: string
  /** Extra allowed CORS origins merged with `specd.yaml` for this listen process. */
  readonly corsOrigins?: readonly string[]
}

/** Listening HTTP server with lifecycle helpers. */
export interface ApiServer {
  readonly app: FastifyInstance
  readonly state: ApiServerState
  listen(): Promise<string>
  close(): Promise<void>
}

/**
 * Creates a Fastify HTTP server wired to specd kernel and code graph.
 *
 * @param options - Server bootstrap options
 */
export async function createApiServer(options: CreateApiServerOptions): Promise<ApiServer> {
  const loader = createConfigLoader({ startDir: options.projectRoot })
  const config: SpecdConfig = await loader.load()
  const auth = options.auth ?? config.api?.auth ?? { type: 'disabled' as const }
  if (auth.type !== 'disabled') {
    throw new Error("Unknown api.auth.type — v1 supports only 'disabled'")
  }

  const logRing = new LogRingBuffer(500)
  const kernel = await createKernel(config, {
    logRing,
    logFormatter: createLogFormatter({ colorize: false }),
  })
  const kernelActor = await resolveKernelActor(config)
  const registry = options.authRegistry ?? defaultAuthAdapterRegistry()
  const verifier = registry.resolve(auth.type, auth.config, { actorResolver: kernelActor })

  const state: ApiServerState = {
    kernel,
    config,
    kernelActor,
    authType: auth.type,
    studioOutput: new StudioOutputBuffer(200),
  }

  const app = Fastify({ logger: false })

  await registerCorsMiddleware(app, config, options.corsOrigins)

  await app.register(
    async (v1) => {
      registerAuthMiddleware(v1, state, verifier, auth.type)

      await v1.register(fastifySwagger, {
        openapi: {
          openapi: '3.1.0',
          info: {
            title: 'SpecD Studio API',
            version: '1.0.0',
          },
        },
      })

      registerApiOpenApiSchemas(v1)

      // Avoid response schema-based filtering; route schemas are for OpenAPI + request validation.
      v1.setSerializerCompiler(() => (data) => JSON.stringify(data))

      v1.setErrorHandler(async (err, _request, reply) => {
        // Validation errors happen before `apiHandler` runs, so we normalize them here.
        if (
          typeof err === 'object' &&
          err !== null &&
          'validation' in err &&
          (err as { validation?: unknown }).validation !== undefined
        ) {
          const message =
            typeof (err as { message?: unknown }).message === 'string'
              ? (err as { message?: unknown }).message
              : undefined
          await reply
            .status(400)
            .type('application/problem+json')
            .send({
              type: 'urn:specd:error:INVALID_REQUEST',
              title: 'Invalid Request',
              status: 400,
              detail: message ?? 'Request validation failed',
              code: 'INVALID_REQUEST',
            })
          return
        }

        const { status, body } = toProblemJson(err)
        await reply.status(status).type('application/problem+json').send(body)
      })

      v1.get('/documentation/json', async (_req, reply) => {
        return reply.send(v1.swagger())
      })

      registerV1Routes(v1)
    },
    { prefix: '/v1' },
  )

  if (options.uiDistPath !== undefined) {
    const indexPath = path.join(options.uiDistPath, 'index.html')
    if (!fs.existsSync(indexPath)) {
      throw new Error(
        `Studio UI dist is missing index.html at ${options.uiDistPath}. Run: pnpm --filter @specd/studio-web build`,
      )
    }
    await app.register(fastifyStatic, {
      root: options.uiDistPath,
      prefix: '/',
    })
    app.setNotFoundHandler(async (request, reply) => {
      if (request.url.startsWith('/v1')) {
        return reply.status(404).send({ error: 'Not Found' })
      }
      const pathname = request.url.split('?')[0] ?? request.url
      const hasFileExtension = /\.[a-z0-9]+$/i.test(pathname)
      const acceptsHtml = (request.headers.accept ?? '').includes('text/html')
      if (
        request.method === 'GET' &&
        !hasFileExtension &&
        acceptsHtml &&
        fs.existsSync(indexPath)
      ) {
        return reply.type('text/html').send(fs.readFileSync(indexPath, 'utf8'))
      }
      return reply.status(404).send({ error: 'Not Found' })
    })
  }

  const host = options.host ?? '127.0.0.1'
  const port = options.port ?? 3847

  return {
    app,
    state,
    async listen() {
      const address = await app.listen({ host, port })
      for (const signal of ['SIGINT', 'SIGTERM'] as const) {
        process.once(signal, () => {
          void app.close()
        })
      }
      return address
    },
    async close() {
      await app.close()
    },
  }
}
