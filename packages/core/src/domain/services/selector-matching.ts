import { type Selector } from '../value-objects/selector.js'
import { safeRegex } from './safe-regex.js'

/**
 * Generic node interface for selector matching. Any AST node type
 * (e.g. `ArtifactNode`, `RuleEvaluatorNode`) that is structurally
 * compatible with this interface can be passed directly — no casting needed.
 */
export interface SelectorNode {
  readonly type: string
  readonly label?: string
  readonly value?: string | number | boolean | null
  readonly children?: readonly SelectorNode[]
  readonly level?: number
  readonly [key: string]: unknown
}

/**
 * Finds all nodes matching the given selector within a root node.
 * Nodes are returned in document order.
 *
 * @param root - The root node to search from
 * @param selector - The selector criteria to match against
 * @returns All matching nodes in document order
 */
export function findNodes(root: SelectorNode, selector: Selector): SelectorNode[] {
  const results: SelectorNode[] = []
  collectAll(root, selector, [], results)
  return results
}

/** A matched node together with its ancestor chain (root to parent). */
export interface NodeMatch {
  readonly node: SelectorNode
  readonly ancestors: readonly SelectorNode[]
}

/**
 * Like {@link findNodes} but also returns the ancestor chain for each match.
 * Useful when callers need parent context (e.g. `parentLabel` in field extraction).
 *
 * @param root - The root node to search from
 * @param selector - The selector criteria to match against
 * @returns Matched nodes with their ancestors, in document order
 */
export function findNodesWithAncestors(root: SelectorNode, selector: Selector): NodeMatch[] {
  const results: NodeMatch[] = []
  collectAllWithAncestors(root, selector, [], results)
  return results
}

/**
 * Recursively collects matching nodes with their ancestor chains.
 *
 * @param node - Current node being evaluated
 * @param selector - Selector to match
 * @param ancestors - Ordered list of ancestor nodes (root to parent)
 * @param results - Accumulator for matched nodes
 */
function collectAllWithAncestors(
  node: SelectorNode,
  selector: Selector,
  ancestors: readonly SelectorNode[],
  results: NodeMatch[],
): void {
  if (nodeMatches(node, selector, ancestors)) {
    results.push({ node, ancestors })
  }
  const newAncestors = [...ancestors, node]
  for (const child of node.children ?? []) {
    collectAllWithAncestors(child, selector, newAncestors, results)
  }
}

/**
 * Returns `true` if `node` matches all criteria in `selector`.
 *
 * @param node - The node to evaluate
 * @param selector - The selector criteria
 * @param ancestors - Ancestor nodes from root to the node's parent
 * @returns Whether the node matches
 */
export function nodeMatches(
  node: SelectorNode,
  selector: Selector,
  ancestors: readonly SelectorNode[] = [],
): boolean {
  if (node.type !== selector.type) return false

  if (selector.matches !== undefined) {
    const regex = safeRegex(selector.matches, 'i')
    if (regex === null || !regex.test(node.label ?? '')) return false
  }

  if (selector.contains !== undefined) {
    const regex = safeRegex(selector.contains, 'i')
    // For composite nodes (no own value, content in children), derive value
    // from children — e.g. plaintext paragraphs store text in child line nodes.
    let text = String(node.value ?? '')
    if (!text && node.children) {
      text = node.children.map((c) => String(c.value ?? '')).join('\n')
    }
    if (regex === null || !regex.test(text)) return false
  }

  if (selector.level !== undefined) {
    if (node.level !== selector.level) return false
  }

  if (selector.where !== undefined) {
    const innerContainer = node.children?.[0]
    const fieldNodes = innerContainer?.children ?? node.children ?? []
    for (const [k, v] of Object.entries(selector.where)) {
      const re = safeRegex(v, 'i')
      const field = fieldNodes.find((c) => c.label === k)
      if (re === null || field === undefined || !re.test(String(field.value ?? ''))) return false
    }
  }

  if (selector.parent !== undefined) {
    const nearestOfType = [...ancestors].reverse().find((a) => a.type === selector.parent!.type)
    if (nearestOfType === undefined) return false
    if (!nodeMatches(nearestOfType, selector.parent, [])) return false
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
export function collectAll(
  node: SelectorNode,
  selector: Selector,
  ancestors: readonly SelectorNode[],
  results: SelectorNode[],
): void {
  if (nodeMatches(node, selector, ancestors)) {
    results.push(node)
  }
  const newAncestors = [...ancestors, node]
  for (const child of node.children ?? []) {
    collectAll(child, selector, newAncestors, results)
  }
}

/**
 * Selects nodes matching the given selector, optionally constrained by a parent selector.
 * Supports `selector.index` filtering for targeting specific items.
 *
 * This is the entry point used by the rule evaluator, which needs parent-scoped
 * selection and index support beyond what `findNodes` provides.
 *
 * @param root - The AST root node to search
 * @param selector - The selector criteria to match
 * @returns All matching nodes, filtered by `selector.index` when present
 */
export function selectBySelector(root: SelectorNode, selector: Selector): SelectorNode[] {
  if (selector.parent !== undefined) {
    const parentNodes = selectBySelector(root, selector.parent)
    // Strip parent from selector — parent scope is already resolved
    const childSelector: Selector = {
      type: selector.type,
      ...(selector.matches !== undefined ? { matches: selector.matches } : {}),
      ...(selector.contains !== undefined ? { contains: selector.contains } : {}),
      ...(selector.index !== undefined ? { index: selector.index } : {}),
      ...(selector.where !== undefined ? { where: selector.where } : {}),
      ...(selector.level !== undefined ? { level: selector.level } : {}),
    }
    const result: SelectorNode[] = []
    for (const parentNode of parentNodes) {
      const children = parentNode.children ?? []
      result.push(...children.filter((child) => nodeMatches(child, childSelector)))
    }
    if (selector.index !== undefined) {
      const node = result[selector.index]
      return node !== undefined ? [node] : []
    }
    return result
  }
  const all = collectAllNodes(root)
  const matched = all.filter((node) => nodeMatches(node, selector))
  if (selector.index !== undefined) {
    const node = matched[selector.index]
    return node !== undefined ? [node] : []
  }
  return matched
}

/**
 * Recursively collects all nodes in the AST, including the root.
 * Used by `selectBySelector` for flat-list filtering.
 *
 * @param root - The starting AST node
 * @returns All nodes in document order
 */
export function collectAllNodes(root: SelectorNode): SelectorNode[] {
  const result: SelectorNode[] = [root]
  if (root.children !== undefined) {
    for (const child of root.children) {
      result.push(...collectAllNodes(child))
    }
  }
  return result
}
