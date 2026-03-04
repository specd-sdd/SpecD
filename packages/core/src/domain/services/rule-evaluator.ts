import { type ValidationRule } from '../value-objects/validation-rule.js'
import { type Selector } from '../value-objects/selector.js'
import { safeRegex } from './safe-regex.js'

/** A single node in a normalized artifact AST (domain-local mirror). */
export interface RuleEvaluatorNode {
  readonly type: string
  readonly label?: string
  readonly value?: string | number | boolean | null
  readonly children?: readonly RuleEvaluatorNode[]
  readonly level?: number
  readonly ordered?: boolean
  readonly [key: string]: unknown
}

/**
 * Minimal parser contract needed by the rule evaluator.
 *
 * Domain services must not depend on application ports, so we define only
 * the subset of `RuleEvaluatorParser` that rule evaluation actually uses.
 */
export interface RuleEvaluatorParser {
  renderSubtree(node: RuleEvaluatorNode): string
}

/** A single validation failure — missing artifact, failed rule, or application error. */
export interface RuleEvaluationFailure {
  /** The artifact type ID this failure pertains to. */
  artifactId: string
  /** Human-readable description suitable for CLI output. */
  description: string
}

/** A non-fatal rule mismatch (`required: false` rule that was absent). */
export interface RuleEvaluationWarning {
  /** The artifact type ID this warning pertains to. */
  artifactId: string
  /** Human-readable description suitable for CLI output. */
  description: string
}

/** Result of evaluating validation rules against an AST. */
export interface RuleEvaluationResult {
  failures: RuleEvaluationFailure[]
  warnings: RuleEvaluationWarning[]
}

/**
 * Evaluates a list of validation rules against an AST root node.
 *
 * Pure function — no I/O, no side effects. Suitable for use in both
 * change-scoped and spec-scoped validation workflows.
 *
 * @param rules - The rules to evaluate
 * @param root - The AST root node to evaluate against
 * @param artifactId - The artifact type ID for failure/warning attribution
 * @param parser - The parser for rendering subtrees during `contentMatches` checks
 * @returns An object containing all failures and warnings collected
 */
export function evaluateRules(
  rules: readonly ValidationRule[],
  root: RuleEvaluatorNode,
  artifactId: string,
  parser: RuleEvaluatorParser,
): RuleEvaluationResult {
  const failures: RuleEvaluationFailure[] = []
  const warnings: RuleEvaluationWarning[] = []
  for (const rule of rules) {
    evaluateRule(rule, root, artifactId, parser, failures, warnings)
  }
  return { failures, warnings }
}

/**
 * Selects nodes from the AST according to the rule's `path` or `selector`, defaulting to the root.
 *
 * @param root - The AST root node to select from
 * @param rule - The validation rule containing the selection criteria
 * @returns The matched AST nodes
 */
export function selectNodes(root: RuleEvaluatorNode, rule: ValidationRule): RuleEvaluatorNode[] {
  if (rule.path !== undefined) return selectByJsonPath(root, rule.path)
  if (rule.selector !== undefined) return selectBySelector(root, rule.selector)
  return [root]
}

/**
 * Selects nodes matching the given selector, optionally constrained by a parent selector.
 *
 * @param root - The AST root node to search
 * @param selector - The selector criteria to match
 * @returns All matching nodes, filtered by `selector.index` when present
 */
export function selectBySelector(root: RuleEvaluatorNode, selector: Selector): RuleEvaluatorNode[] {
  if (selector.parent !== undefined) {
    const parentNodes = selectBySelector(root, selector.parent)
    const result: RuleEvaluatorNode[] = []
    for (const parentNode of parentNodes) {
      const children = parentNode.children ?? []
      result.push(...children.filter((child) => nodeMatches(child, selector)))
    }
    if (selector.index !== undefined) {
      const node = result[selector.index]
      return node !== undefined ? [node] : []
    }
    return result
  }
  const all = collectNodes(root)
  const matched = all.filter((node) => nodeMatches(node, selector))
  if (selector.index !== undefined) {
    const node = matched[selector.index]
    return node !== undefined ? [node] : []
  }
  return matched
}

/**
 * Returns `true` if the node satisfies all criteria in the selector.
 *
 * @param node - The AST node to test
 * @param selector - The selector criteria to match against
 * @returns Whether the node matches the selector
 */
export function nodeMatches(node: RuleEvaluatorNode, selector: Selector): boolean {
  if (node.type !== selector.type) return false
  if (selector.matches !== undefined) {
    const re = safeRegex(selector.matches, 'i')
    if (re === null || !re.test(node.label ?? '')) return false
  }
  if (selector.contains !== undefined) {
    const re = safeRegex(selector.contains, 'i')
    if (re === null || !re.test(String(node.value ?? ''))) return false
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
  return true
}

/**
 * Recursively collects all nodes in the AST, including the root.
 *
 * @param root - The starting AST node
 * @returns All nodes in document order
 */
export function collectNodes(root: RuleEvaluatorNode): RuleEvaluatorNode[] {
  const result: RuleEvaluatorNode[] = [root]
  if (root.children !== undefined) {
    for (const child of root.children) {
      result.push(...collectNodes(child))
    }
  }
  return result
}

/**
 * Selects nodes from the AST using a simplified JSONPath expression.
 *
 * @param root - The AST root node to navigate
 * @param path - The JSONPath expression (e.g. `$.children[*]`)
 * @returns All nodes matching the path
 */
export function selectByJsonPath(root: RuleEvaluatorNode, path: string): RuleEvaluatorNode[] {
  if (path === '$') return [root]
  const tokens = tokenizeJsonPath(path)
  let current: unknown[] = [root]
  for (const token of tokens) {
    const next: unknown[] = []
    if (token === '$') {
      current = [root]
      continue
    }
    if (token.startsWith('..')) {
      const field = token.slice(2)
      for (const node of current) next.push(...recursiveCollect(node, field))
    } else if (token.startsWith('.')) {
      const field = token.slice(1)
      for (const node of current) {
        if (node !== null && typeof node === 'object' && !Array.isArray(node)) {
          const val = (node as Record<string, unknown>)[field]
          if (val !== undefined) next.push(val)
        }
      }
    } else if (token === '[*]') {
      for (const node of current) {
        if (Array.isArray(node)) {
          for (const item of node as unknown[]) next.push(item)
        }
      }
    } else if (/^\[\d+\]$/.test(token)) {
      const idx = parseInt(token.slice(1, -1), 10)
      for (const node of current) {
        if (Array.isArray(node) && node[idx] !== undefined) next.push(node[idx])
      }
    }
    current = next
  }
  return current.filter(
    (n): n is RuleEvaluatorNode =>
      n !== null &&
      typeof n === 'object' &&
      !Array.isArray(n) &&
      typeof (n as Record<string, unknown>)['type'] === 'string',
  )
}

/**
 * Tokenises a JSONPath expression into its component segments.
 *
 * @param path - The JSONPath expression string
 * @returns An array of path token strings
 */
export function tokenizeJsonPath(path: string): string[] {
  const tokens: string[] = []
  let i = 0
  while (i < path.length) {
    if (path[i] === '$') {
      tokens.push('$')
      i++
    } else if (path[i] === '.' && path[i + 1] === '.') {
      const rest = path.slice(i + 2)
      const dotIdx = rest.indexOf('.')
      const brIdx = rest.indexOf('[')
      const stop =
        dotIdx === -1 && brIdx === -1
          ? rest.length
          : dotIdx === -1
            ? brIdx
            : brIdx === -1
              ? dotIdx
              : Math.min(dotIdx, brIdx)
      tokens.push('..' + rest.slice(0, stop))
      i += 2 + stop
    } else if (path[i] === '.') {
      const rest = path.slice(i + 1)
      const dotIdx = rest.indexOf('.')
      const brIdx = rest.indexOf('[')
      const stop =
        dotIdx === -1 && brIdx === -1
          ? rest.length
          : dotIdx === -1
            ? brIdx
            : brIdx === -1
              ? dotIdx
              : Math.min(dotIdx, brIdx)
      tokens.push('.' + rest.slice(0, stop))
      i += 1 + stop
    } else if (path[i] === '[') {
      const close = path.indexOf(']', i)
      tokens.push(path.slice(i, close + 1))
      i = close + 1
    } else {
      i++
    }
  }
  return tokens
}

/**
 * Recursively collects all values at a given field key from any nested object or array.
 *
 * @param node - The value to traverse (object, array, or primitive)
 * @param field - The field name to collect values for
 * @returns All values found at the given field in any nested structure
 */
export function recursiveCollect(node: unknown, field: string): unknown[] {
  const result: unknown[] = []
  if (node === null || typeof node !== 'object') return result
  if (Array.isArray(node)) {
    for (const item of node) result.push(...recursiveCollect(item, field))
    return result
  }
  const obj = node as Record<string, unknown>
  if (obj[field] !== undefined) result.push(obj[field])
  for (const val of Object.values(obj)) result.push(...recursiveCollect(val, field))
  return result
}

// ---------------------------------------------------------------------------
// Private helper — evaluates a single rule recursively
// ---------------------------------------------------------------------------

/**
 * Evaluates a single validation rule against the AST, collecting failures and warnings.
 *
 * @param rule - The validation rule to evaluate
 * @param root - The root AST node to search within
 * @param artifactId - Identifier of the artifact being validated
 * @param parser - Parser providing selector-based node matching
 * @param failures - Mutable array to push failures into
 * @param warnings - Mutable array to push warnings into
 */
function evaluateRule(
  rule: ValidationRule,
  root: RuleEvaluatorNode,
  artifactId: string,
  parser: RuleEvaluatorParser,
  failures: RuleEvaluationFailure[],
  warnings: RuleEvaluationWarning[],
): void {
  const nodes = selectNodes(root, rule)
  if (nodes.length === 0) {
    const desc = JSON.stringify(rule.selector ?? rule.path ?? {})
    if (rule.required === true) {
      failures.push({ artifactId, description: `Required rule not satisfied: ${desc}` })
    } else if (rule.required === false) {
      warnings.push({ artifactId, description: `Optional rule not satisfied: ${desc}` })
    }
    return
  }
  for (const node of nodes) {
    if (rule.contentMatches !== undefined) {
      const re = safeRegex(rule.contentMatches)
      if (re === null) {
        failures.push({
          artifactId,
          description: `Invalid regex pattern '${rule.contentMatches}'`,
        })
      } else {
        const serialized = parser.renderSubtree(node)
        if (!re.test(serialized)) {
          failures.push({
            artifactId,
            description: `Node content does not match pattern '${rule.contentMatches}'`,
          })
        }
      }
    }
    if (rule.children !== undefined) {
      for (const childRule of rule.children) {
        evaluateRule(childRule, node, artifactId, parser, failures, warnings)
      }
    }
  }
}
