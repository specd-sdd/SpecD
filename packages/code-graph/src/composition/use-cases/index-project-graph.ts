import { IndexProjectGraph } from '../../application/use-cases/index-project-graph.js'

/**
 * Constructs a stateless `IndexProjectGraph` use case.
 *
 * @returns A new `IndexProjectGraph` instance
 */
export function createIndexProjectGraph(): IndexProjectGraph {
  return new IndexProjectGraph()
}
