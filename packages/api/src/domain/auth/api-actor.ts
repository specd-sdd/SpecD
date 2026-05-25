/**
 * Authenticated API principal when server auth is enabled (future types).
 * v1 uses `disabled` and relies on core {@link ActorResolver} instead.
 */
export interface ApiActor {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly roles?: readonly string[]
}
