import {
  type ActorResolver,
  type CodeGraphProvider,
  type SdkHostContext,
  type SpecdConfig,
  createVcsAdapter,
  createVcsActorResolver,
} from '@specd/sdk'
import { type ApiActor } from '../domain/auth/api-actor.js'
import { ApiActorResolver } from '../infrastructure/auth/api-actor-resolver.js'
import { type LongLivedGraphHolder, withHealthyGraphProvider } from './long-lived-graph.js'

/** Per-request API context shared by handlers. */
export interface ApiContext extends SdkHostContext {
  readonly config: SpecdConfig
  readonly actor: ActorResolver
  readonly authType: string
  readonly apiActor: ApiActor | null
  /** Returns the process-scoped long-lived opened graph provider. */
  getGraphProvider(): Promise<CodeGraphProvider>
  /**
   * Runs a callback with a healthy long-lived provider (reopens once on stale).
   * Index routes pass this provider into `runIndexProjectGraph`; no post-index
   * host refresh is required when indexing uses the injected instance.
   */
  withGraphProvider<TResult>(
    run: (provider: CodeGraphProvider) => Promise<TResult>,
  ): Promise<TResult>
}

/** Process-scoped dependencies for building request context. */
export interface ApiServerState extends SdkHostContext {
  readonly config: SpecdConfig
  readonly kernelActor: ActorResolver
  readonly authType: string
  /** Mutable holder for the process-scoped opened graph provider. */
  readonly graph: LongLivedGraphHolder
}

/**
 * Builds per-request context with kernel, actor, and long-lived graph access.
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
    getGraphProvider() {
      return Promise.resolve(state.graph.provider)
    },
    withGraphProvider(run) {
      return withHealthyGraphProvider(state.createGraphProvider, state.graph, run)
    },
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
