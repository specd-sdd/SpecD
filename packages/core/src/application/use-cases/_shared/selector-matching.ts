import { type ArtifactNode } from '../../ports/artifact-parser.js'
import { type Selector } from '../../../domain/value-objects/selector.js'
import { safeRegex } from '../../../domain/services/safe-regex.js'

/**
 * Finds all AST nodes matching the given selector within a root node.
 *
 * @param root - The root node to search from
 * @param selector - The selector criteria to match against
 * @returns All matching nodes in document order
 */
export function findNodes(root: ArtifactNode, selector: Selector): ArtifactNode[] {
  const results: ArtifactNode[] = []
  collectNodes(root, selector, [], results)
  return results
}

/**
 * Returns `true` if `node` matches all criteria in `selector`.
 *
 * @param node - The node to evaluate
 * @param selector - The selector criteria
 * @param ancestors - Ancestor nodes from root to the node's parent
 * @returns Whether the node matches
 */
export function selectorMatches(
  node: ArtifactNode,
  selector: Selector,
  ancestors: readonly ArtifactNode[],
): boolean {
  if (node.type !== selector.type) return false

  if (selector.matches !== undefined) {
    const regex = safeRegex(selector.matches, 'i')
    if (regex === null || !regex.test(node.label ?? '')) return false
  }

  if (selector.contains !== undefined) {
    const regex = safeRegex(selector.contains, 'i')
    if (regex === null || !regex.test(String(node.value ?? ''))) return false
  }

  if (selector.parent !== undefined) {
    // Find the nearest ancestor whose type matches the parent selector's type
    const nearestOfType = [...ancestors].reverse().find((a) => a.type === selector.parent!.type)
    if (nearestOfType === undefined) return false
    if (!selectorMatches(nearestOfType, selector.parent, [])) return false
  }

  return true
}

/**
 * Recursively collects nodes matching the selector, tracking the ancestor chain.
 *
 * @param node - Current node being evaluated
 * @param selector - Selector to match
 * @param ancestors - Ordered list of ancestor nodes (root to parent)
 * @param results - Accumulator for matched nodes
 */
function collectNodes(
  node: ArtifactNode,
  selector: Selector,
  ancestors: readonly ArtifactNode[],
  results: ArtifactNode[],
): void {
  if (selectorMatches(node, selector, ancestors)) {
    results.push(node)
  }
  const newAncestors = [...ancestors, node]
  for (const child of node.children ?? []) {
    collectNodes(child, selector, newAncestors, results)
  }
}
