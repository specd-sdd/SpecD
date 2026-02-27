import { type GitAdapter } from '../application/ports/git-adapter.js'
import { GitCLIAdapter } from '../infrastructure/git/git-adapter.js'

/**
 * Discriminated union of all supported `GitAdapter` adapter configurations.
 */
export type CreateGitAdapterConfig = {
  /** Adapter type discriminant. */
  readonly type: 'git-cli'
  /** Working directory for git commands. Defaults to `process.cwd()` when omitted. */
  readonly cwd?: string
}

/**
 * Constructs a `GitAdapter` implementation for the given adapter type.
 *
 * Returns the abstract `GitAdapter` port type — callers never see the
 * concrete class.
 *
 * @param config - Discriminated union config identifying the adapter type and its options
 * @returns A fully constructed `GitAdapter`
 */
export function createGitAdapter(config: CreateGitAdapterConfig): GitAdapter {
  switch (config.type) {
    case 'git-cli':
      return new GitCLIAdapter(config.cwd)
  }
}
