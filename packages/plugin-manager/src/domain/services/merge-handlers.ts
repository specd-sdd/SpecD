import { DuplicateHandlerKindError } from '../errors/duplicate-handler-kind-error.js'
import { agentsContributionHandler } from '../handlers/agents-handler.js'
import type { ContributionKindHandler } from '../types/contribution-kind-handler.js'

/**
 * Prepends the built-in agents handler and rejects a repeated kind.
 *
 * @param extra - Host-supplied handlers
 * @returns The merged handler list
 * @throws {DuplicateHandlerKindError} When two handlers share a kind
 */
export function mergeHandlers(
  extra: readonly ContributionKindHandler[],
): readonly ContributionKindHandler[] {
  const handlers = [agentsContributionHandler, ...extra]
  const seen = new Set<string>()
  for (const handler of handlers) {
    if (seen.has(handler.kind)) {
      throw new DuplicateHandlerKindError(handler.kind)
    }
    seen.add(handler.kind)
  }
  return handlers
}
