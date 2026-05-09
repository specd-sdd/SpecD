import {
  type CrossArtifactValidationRule,
  type CrossArtifactParticipant,
} from '../value-objects/cross-artifact-validation.js'
import { safeRegex } from './safe-regex.js'
import { type SelectorNode, selectBySelector } from './selector-matching.js'
import { type RuleEvaluatorParser } from './rule-evaluator.js'

/** Failure emitted by cross-artifact rule evaluation. */
export interface CrossArtifactEvaluationFailure {
  readonly artifactId: string
  readonly description: string
}

/** Warning emitted by cross-artifact rule evaluation. */
export interface CrossArtifactEvaluationWarning {
  readonly artifactId: string
  readonly description: string
}

/** Participant input required by the evaluator. */
export interface CrossArtifactParticipantInput {
  readonly artifactId: string
  readonly root: SelectorNode
  readonly parser: RuleEvaluatorParser
}

/** Input context for evaluating one cross-artifact rule. */
export interface CrossArtifactEvaluationContext {
  readonly rule: CrossArtifactValidationRule
  readonly participants: ReadonlyMap<string, CrossArtifactParticipantInput>
}

/** Result returned by cross-artifact rule evaluation. */
export interface CrossArtifactEvaluationResult {
  readonly failures: readonly CrossArtifactEvaluationFailure[]
  readonly warnings: readonly CrossArtifactEvaluationWarning[]
}

/**
 * Evaluates one cross-artifact rule against already-prepared participant ASTs.
 *
 * @param context - Rule and participant inputs
 * @returns Failures and warnings from relation evaluation
 */
export function evaluateCrossArtifactRule(
  context: CrossArtifactEvaluationContext,
): CrossArtifactEvaluationResult {
  const failures: CrossArtifactEvaluationFailure[] = []
  const warnings: CrossArtifactEvaluationWarning[] = []
  const keysByAlias = new Map<string, string[]>()

  for (const participant of context.rule.participants) {
    const input = context.participants.get(participant.as)
    if (input === undefined) {
      warnings.push({
        artifactId: participant.artifact,
        description: `Deferred cross-artifact rule '${context.rule.id}': missing participant '${participant.as}'`,
      })
      return { failures, warnings }
    }
    keysByAlias.set(participant.as, extractParticipantKeys(participant, input))
  }

  const aliases = context.rule.relation.between
  const ordering = context.rule.relation.options?.ordering ?? 'ignore'
  if (aliases.length < 2) {
    return { failures, warnings }
  }

  const left = keysByAlias.get(aliases[0] ?? '')
  const right = keysByAlias.get(aliases[1] ?? '')
  if (left === undefined || right === undefined) {
    warnings.push({
      artifactId: context.rule.participants[0]?.artifact ?? 'unknown',
      description: `Deferred cross-artifact rule '${context.rule.id}': unresolved relation aliases`,
    })
    return { failures, warnings }
  }

  const isStrict = ordering === 'strict'
  if (context.rule.relation.kind === 'all-equal') {
    const baseAlias = aliases[0]!
    const baseKeys = keysByAlias.get(baseAlias)!
    for (const alias of aliases.slice(1)) {
      const keys = keysByAlias.get(alias)!
      const ok = isStrict ? equalSequence(baseKeys, keys) : equalSet(baseKeys, keys)
      if (!ok) {
        const onlyInBase = setDifference(baseKeys, keys)
        const onlyInOther = setDifference(keys, baseKeys)
        const parts: string[] = []
        if (onlyInBase.length > 0)
          parts.push(`only in '${baseAlias}': ${formatKeyPreview(onlyInBase)}`)
        if (onlyInOther.length > 0)
          parts.push(`only in '${alias}': ${formatKeyPreview(onlyInOther)}`)
        const orderHint = isStrict ? ' (ordering: strict)' : ''
        failures.push({
          artifactId: context.rule.participants.find((p) => p.as === alias)?.artifact ?? alias,
          description: `Cross-artifact rule '${context.rule.id}' failed: '${baseAlias}' and '${alias}' differ${orderHint}. ${parts.join('. ')}`,
        })
      }
    }
  } else if (context.rule.relation.kind === 'subset') {
    const ok = isStrict ? isSubsequence(left, right) : isSubset(left, right)
    if (!ok) {
      const missing = setDifference(left, right)
      const orderHint = isStrict ? ' (ordering: strict)' : ''
      failures.push({
        artifactId:
          context.rule.participants.find((p) => p.as === aliases[0])?.artifact ?? aliases[0]!,
        description: `Cross-artifact rule '${context.rule.id}' failed: '${aliases[0]}' is not a subset of '${aliases[1]}'${orderHint}. Missing in '${aliases[1]}': ${formatKeyPreview(missing)}`,
      })
    }
  } else if (context.rule.relation.kind === 'superset') {
    const ok = isStrict ? isSubsequence(right, left) : isSubset(right, left)
    if (!ok) {
      const missing = setDifference(right, left)
      const orderHint = isStrict ? ' (ordering: strict)' : ''
      failures.push({
        artifactId:
          context.rule.participants.find((p) => p.as === aliases[0])?.artifact ?? aliases[0]!,
        description: `Cross-artifact rule '${context.rule.id}' failed: '${aliases[0]}' is not a superset of '${aliases[1]}'${orderHint}. Missing in '${aliases[0]}': ${formatKeyPreview(missing)}`,
      })
    }
  }

  return { failures, warnings }
}

/**
 * Extracts normalized comparison keys for one participant from its parsed artifact AST.
 *
 * @param participant - Participant selector and key extraction config
 * @param input - Parsed artifact root and parser for this participant
 * @returns Normalized keys used by relation evaluation
 */
function extractParticipantKeys(
  participant: CrossArtifactParticipant,
  input: CrossArtifactParticipantInput,
): string[] {
  const selected = selectBySelector(input.root, participant.selector)
  const nodes =
    participant.keySelector === undefined
      ? selected
      : selected.flatMap((node) => selectBySelector(node, participant.keySelector!))
  return nodes.map((node) => normalizeKey(readKey(node, participant, input.parser), participant))
}

/**
 * Reads the raw key string from a selector node using the participant key source.
 *
 * @param node - Matched selector node
 * @param participant - Participant key-source configuration
 * @param parser - Parser used when `key.from` is `content`
 * @returns Raw key string before normalization
 */
function readKey(
  node: SelectorNode,
  participant: CrossArtifactParticipant,
  parser: RuleEvaluatorParser,
): string {
  if (participant.key.from === 'label') {
    return node.label ?? ''
  }
  if (participant.key.from === 'value') {
    return node.value === undefined ? '' : String(node.value)
  }
  return parser.renderSubtree(node)
}

/**
 * Applies optional regex capture and strip transforms to a raw key.
 *
 * @param raw - Raw key string
 * @param participant - Participant normalization config
 * @returns Normalized key string
 */
function normalizeKey(raw: string, participant: CrossArtifactParticipant): string {
  let result = raw
  if (participant.key.capture !== undefined) {
    const re = safeRegex(participant.key.capture)
    if (re !== null) {
      const match = re.exec(result)
      if (match?.[1] !== undefined) result = match[1]
    }
  }
  if (participant.key.strip !== undefined) {
    const re = safeRegex(participant.key.strip)
    if (re !== null) result = result.replace(re, '')
  }
  return result
}

/**
 * Compares arrays as mathematical sets (ignores duplicates and order).
 *
 * @param a - Left keys
 * @param b - Right keys
 * @returns True when both sets contain the same unique values
 */
function equalSet(a: readonly string[], b: readonly string[]): boolean {
  const left = new Set(a)
  const right = new Set(b)
  if (left.size !== right.size) return false
  for (const value of left) if (!right.has(value)) return false
  return true
}

/**
 * Compares arrays as exact ordered sequences.
 *
 * @param a - Left keys
 * @param b - Right keys
 * @returns True when length and item order are identical
 */
function equalSequence(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

/**
 * Checks whether all unique values from `a` are present in `b`.
 *
 * @param a - Candidate subset keys
 * @param b - Candidate superset keys
 * @returns True when `a` is a subset of `b`
 */
function isSubset(a: readonly string[], b: readonly string[]): boolean {
  const right = new Set(b)
  for (const value of new Set(a)) {
    if (!right.has(value)) return false
  }
  return true
}

/**
 * Checks whether `a` appears in `b` as an ordered subsequence.
 *
 * @param a - Candidate subsequence keys
 * @param b - Candidate source sequence keys
 * @returns True when all values in `a` appear in order within `b`
 */
function isSubsequence(a: readonly string[], b: readonly string[]): boolean {
  let j = 0
  for (let i = 0; i < a.length; i++) {
    while (j < b.length && b[j] !== a[i]) j++
    if (j === b.length) return false
    j++
  }
  return true
}

/**
 * Returns keys present in `a` but not in `b` (set difference).
 *
 * @param a - Source key collection
 * @param b - Key collection to subtract
 * @returns Unique keys from `a` that are absent from `b`
 */
function setDifference(a: readonly string[], b: readonly string[]): string[] {
  const right = new Set(b)
  return [...new Set(a)].filter((k) => !right.has(k))
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
