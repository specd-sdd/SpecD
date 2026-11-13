import { createVcsAdapter } from '@specd/core'
import { ExplainGraphPath } from '../../application/use-cases/explain-graph-path.js'

/**
 * Constructs a stateless `ExplainGraphPath` use case.
 *
 * @returns A new `ExplainGraphPath` instance
 */
export function createExplainGraphPath(): ExplainGraphPath {
  return new ExplainGraphPath(createVcsAdapter)
}
