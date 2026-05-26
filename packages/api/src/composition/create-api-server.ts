import fs from 'node:fs'
import path from 'node:path'
import fastifyStatic from '@fastify/static'
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
    (v1) => {
      registerAuthMiddleware(v1, state, verifier, auth.type)
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
