import { type ActorResolver } from '../application/ports/actor-resolver.js'

/**
 * Named actor-resolution provider.
 */
export interface ActorProvider {
  /** Human-readable provider name for debugging and tests. */
  readonly name: string

  /**
   * Creates a concrete actor resolver using the given options.
   *
   * @param options - Provider-specific configuration
   * @returns A fully constructed actor resolver
   */
  create(options: Readonly<Record<string, unknown>>): Promise<ActorResolver>
}

/**
 * Specialized actor provider capable of environmental detection.
 */
export interface AutoDetectActorProvider extends ActorProvider {
  /**
   * Attempts to detect if this provider should be active for `cwd`.
   *
   * @param cwd - Directory to inspect
   * @returns A concrete resolver when the provider applies, otherwise `null`
   */
  detect(cwd: string): Promise<ActorResolver | null>
}
