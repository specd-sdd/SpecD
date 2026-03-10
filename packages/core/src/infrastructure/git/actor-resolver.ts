import { type ActorIdentity } from '../../domain/entities/change.js'
import { type ActorResolver } from '../../application/ports/actor-resolver.js'
import { git } from './exec.js'

/**
 * Git-based implementation of {@link ActorResolver}.
 *
 * Reads `user.name` and `user.email` from the local git configuration.
 */
export class GitActorResolver implements ActorResolver {
  private readonly _cwd: string

  /**
   * Creates a new `GitActorResolver`.
   *
   * @param cwd - Working directory for git commands; defaults to `process.cwd()`
   */
  constructor(cwd: string = process.cwd()) {
    this._cwd = cwd
  }

  /**
   * Returns the git identity (`user.name` and `user.email`) of the current user.
   *
   * @returns The actor identity
   * @throws When the current working directory is not inside a git repository
   * @throws When `user.name` or `user.email` are not configured
   */
  async identity(): Promise<ActorIdentity> {
    const [name, email] = await Promise.all([
      git(this._cwd, 'config', 'user.name'),
      git(this._cwd, 'config', 'user.email'),
    ])
    return { name, email }
  }
}
