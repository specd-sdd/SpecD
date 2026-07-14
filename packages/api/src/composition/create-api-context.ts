import {
  type ActorResolver,
  type SdkHostContext,
  type SpecdConfig,
  createVcsAdapter,
  createVcsActorResolver,
} from '@specd/sdk'
import { type ApiActor } from '../domain/auth/api-actor.js'
import { ApiActorResolver } from '../infrastructure/auth/api-actor-resolver.js'

/** Per-request API context shared by handlers. */
export interface ApiContext extends SdkHostContext {
  readonly config: SpecdConfig
  readonly actor: ActorResolver
  readonly authType: string
  readonly apiActor: ApiActor | null
}

/** Process-scoped dependencies for building request context. */
export interface ApiServerState extends SdkHostContext {
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
    createGraphProvider: state.createGraphProvider,
    config: state.config,
    actor,
    authType: state.authType,
    apiActor,
  }
}

/**
 * Resolves the kernel actor resolver for server bootstrap.
 *
 * @param config - Active project configuration
 */
export async function resolveKernelActor(config: SpecdConfig): Promise<ActorResolver> {
  return createVcsActorResolver(await createVcsAdapter(config.projectRoot))
}
