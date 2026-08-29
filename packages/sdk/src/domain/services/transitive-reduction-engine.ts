/**
 * Checks whether a target node is reachable from a start node through one or more intermediate steps.
 *
 * @param start - Starting node identifier.
 * @param target - Target node identifier to reach.
 * @param graph - Directed adjacency map.
 * @param visited - Set tracking visited nodes to avoid cyclic infinite loops.
 * @returns True if target is reachable from start.
 */
function isReachable(
  start: string,
  target: string,
  graph: ReadonlyMap<string, ReadonlySet<string>>,
  visited = new Set<string>(),
): boolean {
  if (visited.has(start)) {
    return false
  }
  visited.add(start)

  const neighbors = graph.get(start)
  if (!neighbors) {
    return false
  }

  for (const neighbor of neighbors) {
    if (neighbor === target) {
      return true
    }
    if (isReachable(neighbor, target, graph, visited)) {
      return true
    }
  }

  return false
}

/**
 * Pure domain service for transitive reduction of Directed Acyclic Graphs (DAGs).
 * Prunes redundant transitive edges (A -> B and B -> C implies A -/-> C).
 */
export class TransitiveReductionEngine {
  /**
   * Reduces an adjacency map to its minimal transitive reduction graph.
   *
   * @param rawDependencies - Directed graph represented as Map<nodeId, Set<targetNodeId>>.
   * @returns Cleaned map containing only direct, non-redundant dependency arrays.
   */
  static reduce(rawDependencies: ReadonlyMap<string, ReadonlySet<string>>): Map<string, string[]> {
    const directDepsMap = new Map<string, Set<string>>()

    for (const [nodeId, deps] of rawDependencies.entries()) {
      directDepsMap.set(nodeId, new Set(deps))
    }

    for (const [nodeId, directDeps] of directDepsMap.entries()) {
      if (directDeps.size <= 1) {
        continue
      }

      const depsList = [...directDeps]
      for (const dep1 of depsList) {
        for (const dep2 of depsList) {
          if (dep1 === dep2) {
            continue
          }

          // If dep2 is reachable from dep1, dep2 is an indirect transitive edge from nodeId
          if (isReachable(dep1, dep2, directDepsMap, new Set([nodeId]))) {
            directDeps.delete(dep2)
          }
        }
      }
    }

    const result = new Map<string, string[]>()
    for (const [nodeId, directDeps] of directDepsMap.entries()) {
      result.set(nodeId, [...directDeps].sort())
    }

    return result
  }
}
