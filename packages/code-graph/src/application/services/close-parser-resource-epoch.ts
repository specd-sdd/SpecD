import {
  type ParserResourceScope,
  type ParserResourceCloseResult,
  type ParserResourceDisposalFailure,
} from '../../domain/value-objects/parser-resource-scope.js'
import { requestGarbageCollection } from './request-garbage-collection.js'

/**
 * Closes a parser-resource epoch:
 * - If scope size is 0, returns immediately without requesting garbage collection.
 * - Otherwise, closes the scope, reports any disposal failures to the callback,
 *   requests garbage collection, and returns the close result.
 *
 * @param scope - Parser resource scope to close.
 * @param onDisposalFailure - Optional callback invoked for each disposal failure.
 * @returns Result containing count of registered resources and list of failures.
 */
export function closeParserResourceEpoch(
  scope: ParserResourceScope,
  onDisposalFailure?: (failure: ParserResourceDisposalFailure) => void,
): ParserResourceCloseResult {
  if (scope.size === 0) {
    return { registered: 0, failures: [] }
  }

  const result = scope.close()

  if (onDisposalFailure !== undefined) {
    for (const failure of result.failures) {
      onDisposalFailure(failure)
    }
  }

  requestGarbageCollection()

  return result
}
