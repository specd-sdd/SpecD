import { createCodeGraphProvider, type CodeGraphProvider } from '@specd/code-graph'
import {
  type Kernel,
  type SpecdConfig,
  type ActorResolver,
  createVcsActorResolver,
} from '@specd/core'
import { type ApiActor } from '../domain/auth/api-actor.js'
import { ApiActorResolver } from '../infrastructure/auth/api-actor-resolver.js'

/** Per-request API context shared by handlers. */
export interface ApiContext {
  readonly kernel: Kernel
  readonly config: SpecdConfig
  readonly actor: ActorResolver
  readonly authType: string
  readonly apiActor: ApiActor | null
  createGraphProvider(): CodeGraphProvider
}

/** Process-scoped dependencies for building request context. */
export interface ApiServerState {
  readonly kernel: Kernel
  readonly config: SpecdConfig
  readonly kernelActor: ActorResolver
  readonly authType: string
}

/**
 * Builds per-request context with kernel, actor, and graph factory.
 *
 * @param state - Process-scoped server state
 * @param apiActor - Optional authenticated principal from middleware
 */
export function createApiContext(state: ApiServerState, apiActor: ApiActor | null): ApiContext {
  const actor = new ApiActorResolver(state.kernelActor, apiActor)
  return {
    kernel: state.kernel,
    config: state.config,
    actor,
    authType: state.authType,
    apiActor,
    createGraphProvider() {
      return createCodeGraphProvider(state.config)
    },
  }
}

/**
 * Resolves the kernel actor resolver for server bootstrap.
 *
 * @param config - Active project configuration
 */
export async function resolveKernelActor(config: SpecdConfig): Promise<ActorResolver> {
  const result = createVcsActorResolver(config.projectRoot)
  if (result instanceof Promise) {
    return result
  }
  return result
}
