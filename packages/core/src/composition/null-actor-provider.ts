import { type ActorResolver } from '../application/ports/actor-resolver.js'
import { type AutoDetectActorProvider } from './kernel-registries.js'
import { NullActorResolver } from '../infrastructure/null/actor-resolver.js'

/**
 * Null actor provider — always returns null from detect(), always returns
 * NullActorResolver from create().
 */
export const NullAutoDetectActorProvider: AutoDetectActorProvider = {
  name: 'null',
  create(options: Readonly<Record<string, unknown>>): Promise<ActorResolver> {
    void options
    return Promise.resolve(new NullActorResolver())
  },
  detect(): Promise<ActorResolver | null> {
    return Promise.resolve(null)
  },
}
