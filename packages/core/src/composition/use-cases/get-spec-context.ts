import { GetSpecContext } from '../../application/use-cases/get-spec-context.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import { createSpecRepository } from '../spec-repository.js'
import { NodeContentHasher } from '../../infrastructure/node/content-hasher.js'

/**
 * Constructs a `GetSpecContext` use case wired to all configured workspaces.
 *
 * @param config - The fully-resolved project configuration
 * @returns The pre-wired use case instance
 */
export function createGetSpecContext(config: SpecdConfig): GetSpecContext {
  const specRepos = new Map(
    config.workspaces.map((ws) => [
      ws.name,
      createSpecRepository(
        'fs',
        { workspace: ws.name, ownership: ws.ownership, isExternal: ws.isExternal },
        { specsPath: ws.specsPath, ...(ws.prefix !== undefined ? { prefix: ws.prefix } : {}) },
      ),
    ]),
  )
  const hasher = new NodeContentHasher()
  return new GetSpecContext(specRepos, hasher)
}
