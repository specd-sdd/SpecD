import { type ActorIdentity } from '../../domain/entities/change.js'
import { type ActorResolver } from '../../application/ports/actor-resolver.js'
import { svn } from './exec.js'

/**
 * Subversion-based implementation of {@link ActorResolver}.
 *
 * Reads the authenticated username from `svn auth`. SVN does not store
 * an email address natively, so email is left empty.
 */
export class SvnActorResolver implements ActorResolver {
  private readonly _cwd: string

  /**
   * Creates a new `SvnActorResolver`.
   *
   * @param cwd - Working directory for svn commands; defaults to `process.cwd()`
   */
  constructor(cwd: string = process.cwd()) {
    this._cwd = cwd
  }

  /** @inheritdoc */
  async identity(): Promise<ActorIdentity> {
    const username = await svn(this._cwd, 'info', '--show-item', 'last-changed-author')
    return { name: username, email: '' }
  }
}
