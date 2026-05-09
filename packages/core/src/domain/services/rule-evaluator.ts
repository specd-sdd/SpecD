import { type ValidationRule } from '../value-objects/validation-rule.js'
import { type ValidationCount } from '../value-objects/cross-artifact-validation.js'
import { safeRegex } from './safe-regex.js'
import {
  type SelectorNode,
  selectBySelector,
  nodeMatches,
  collectAllNodes,
} from './selector-matching.js'

/** @deprecated Use {@link SelectorNode} from `selector-matching.ts` instead. */
export type RuleEvaluatorNode = SelectorNode

/**
 * Minimal parser contract needed by the rule evaluator.
 *
 * Domain services must not depend on application ports, so we define only
 * the subset of `RuleEvaluatorParser` that rule evaluation actually uses.
 */
export interface RuleEvaluatorParser {
  renderSubtree(node: SelectorNode): string
}

/** A single validation failure — missing artifact, failed rule, or application error. */
export interface RuleEvaluationFailure {
  /** The artifact type ID this failure pertains to. */
  readonly artifactId: string
  /** Human-readable description suitable for CLI output. */
  readonly description: string
}

/** A non-fatal rule mismatch (`required: false` rule that was absent). */
export interface RuleEvaluationWarning {
  /** The artifact type ID this warning pertains to. */
  readonly artifactId: string
  /** Human-readable description suitable for CLI output. */
  readonly description: string
}

/** Result of evaluating validation rules against an AST. */
export interface RuleEvaluationResult {
  readonly failures: RuleEvaluationFailure[]
  readonly warnings: RuleEvaluationWarning[]
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
  root: SelectorNode,
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
export function selectNodes(root: SelectorNode, rule: ValidationRule): SelectorNode[] {
  if (rule.path !== undefined) return selectByJsonPath(root, rule.path)
  if (rule.selector !== undefined) return selectBySelector(root, rule.selector)
  return [root]
}

/**
 * Selects nodes from the AST using a simplified JSONPath expression.
 *
 * @param root - The AST root node to navigate
 * @param path - The JSONPath expression (e.g. `$.children[*]`)
 * @returns All nodes matching the path
 */
export function selectByJsonPath(root: SelectorNode, path: string): SelectorNode[] {
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
    (n): n is SelectorNode =>
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
      if (close === -1) break
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

// Re-export for backward compatibility — external consumers that imported
// these from rule-evaluator can still use them.
export { selectBySelector, nodeMatches, collectAllNodes as collectNodes }

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
  root: SelectorNode,
  artifactId: string,
  parser: RuleEvaluatorParser,
  failures: RuleEvaluationFailure[],
  warnings: RuleEvaluationWarning[],
): void {
  const nodes = selectNodes(root, rule)
  if (nodes.length === 0) {
    const desc = JSON.stringify(rule.selector ?? rule.path ?? {})
    const isRequired = rule.required ?? true
    if (isRequired) {
      failures.push({ artifactId, description: `Required rule not satisfied: ${desc}` })
    } else {
      warnings.push({ artifactId, description: `Optional rule not satisfied: ${desc}` })
    }
    return
  }

  if (rule.count !== undefined) {
    evaluateCount(rule.count, nodes, artifactId, parser, failures)
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

/**
 * Evaluates total and unique cardinality constraints for one selected node set.
 *
 * @param count - Count constraints from the validation rule
 * @param nodes - Selected nodes for this rule
 * @param artifactId - Artifact identifier for failure attribution
 * @param parser - Parser used for `unique.by.from: content`
 * @param failures - Mutable failure collection
 */
function evaluateCount(
  count: ValidationCount,
  nodes: readonly SelectorNode[],
  artifactId: string,
  parser: RuleEvaluatorParser,
  failures: RuleEvaluationFailure[],
): void {
  const { exactly, min, max } = count
  const size = nodes.length
  if (exactly !== undefined && size !== exactly) {
    failures.push({
      artifactId,
      description: `Selected node count ${size} does not match exactly ${exactly}`,
    })
  }
  if (min !== undefined && size < min) {
    failures.push({
      artifactId,
      description: `Selected node count ${size} is below min ${min}`,
    })
  }
  if (max !== undefined && size > max) {
    failures.push({
      artifactId,
      description: `Selected node count ${size} is above max ${max}`,
    })
  }

  if (count.unique === undefined) return
  const normalized = nodes.map((node) =>
    normalizeCountKey(readCountKey(node, count, parser), count),
  )
  const uniqueSize = new Set(normalized).size
  if (uniqueSize !== normalized.length) {
    const dups = findDuplicateKeys(normalized)
    failures.push({
      artifactId,
      description: `Duplicate keys found (${uniqueSize} unique of ${normalized.length} total): ${formatKeyPreview(dups)}`,
    })
  }

  const { exactlyUnique, minUnique, maxUnique } = count.unique
  if (exactlyUnique !== undefined && uniqueSize !== exactlyUnique) {
    failures.push({
      artifactId,
      description: `Selected unique key count ${uniqueSize} does not match exactlyUnique ${exactlyUnique}`,
    })
  }
  if (minUnique !== undefined && uniqueSize < minUnique) {
    failures.push({
      artifactId,
      description: `Selected unique key count ${uniqueSize} is below minUnique ${minUnique}`,
    })
  }
  if (maxUnique !== undefined && uniqueSize > maxUnique) {
    failures.push({
      artifactId,
      description: `Selected unique key count ${uniqueSize} is above maxUnique ${maxUnique}`,
    })
  }
}

/**
 * Reads the raw unique key for one selected node according to `count.unique.by`.
 *
 * @param node - Selected node
 * @param count - Count block with unique key extraction settings
 * @param parser - Parser for content-based extraction
 * @returns Raw key value before capture/strip normalization
 */
function readCountKey(
  node: SelectorNode,
  count: ValidationCount,
  parser: RuleEvaluatorParser,
): string {
  const by = count.unique?.by
  if (by === undefined || by.from === 'label') return node.label ?? ''
  if (by.from === 'value') return node.value === undefined ? '' : String(node.value)
  return parser.renderSubtree(node)
}

/**
 * Applies optional capture/strip normalization to one raw unique key.
 *
 * @param raw - Raw key value
 * @param count - Count block with unique key extraction settings
 * @returns Normalized key
 */
function normalizeCountKey(raw: string, count: ValidationCount): string {
  const by = count.unique?.by
  if (by === undefined) return raw
  let result = raw
  if (by.capture !== undefined) {
    const re = safeRegex(by.capture)
    if (re !== null) {
      const match = re.exec(result)
      if (match?.[1] !== undefined) result = match[1]
    }
  }
  if (by.strip !== undefined) {
    const re = safeRegex(by.strip)
    if (re !== null) result = result.replace(re, '')
  }
  return result
}

/**
 * Returns the keys that appear more than once in the input array.
 *
 * @param keys - Normalized keys to check for duplicates
 * @returns Keys that appear two or more times
 */
function findDuplicateKeys(keys: readonly string[]): string[] {
  const seen = new Map<string, number>()
  for (const key of keys) {
    seen.set(key, (seen.get(key) ?? 0) + 1)
  }
  return [...seen.entries()].filter(([, c]) => c > 1).map(([k]) => k)
}

/**
 * Formats a list of keys for inclusion in a validation failure description.
 * Truncates after `max` entries with an "and N more" suffix.
 *
 * @param keys - Keys to format
 * @param max - Maximum number of keys to show before truncating
 * @returns A human-readable key preview string
 */
function formatKeyPreview(keys: readonly string[], max = 10): string {
  const shown = keys
    .slice(0, max)
    .map((k) => `'${k}'`)
    .join(', ')
  if (keys.length <= max) return shown
  return `${shown} and ${keys.length - max} more`
}
