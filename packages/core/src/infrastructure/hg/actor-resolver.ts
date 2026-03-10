import { type ActorIdentity } from '../../domain/entities/change.js'
import { type ActorResolver } from '../../application/ports/actor-resolver.js'
import { hg } from './exec.js'

/**
 * Mercurial-based implementation of {@link ActorResolver}.
 *
 * Reads the `ui.username` configuration which is typically in the format
 * `Name <email>`. Falls back to the raw value as name with an empty email
 * when the format does not match.
 */
export class HgActorResolver implements ActorResolver {
  private readonly _cwd: string

  /**
   * Creates a new `HgActorResolver`.
   *
   * @param cwd - Working directory for hg commands; defaults to `process.cwd()`
   */
  constructor(cwd: string = process.cwd()) {
    this._cwd = cwd
  }

  /** @inheritdoc */
  async identity(): Promise<ActorIdentity> {
    const raw = await hg(this._cwd, 'config', 'ui.username')
    // hg ui.username is typically "Name <email>"
    const match = raw.match(/^(.+?)\s*<(.+?)>$/)
    if (match) {
      return { name: match[1]!.trim(), email: match[2]!.trim() }
    }
    return { name: raw, email: '' }
  }
}
