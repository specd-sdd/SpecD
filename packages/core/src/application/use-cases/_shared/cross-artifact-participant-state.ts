import { type SelectorNode } from '../../../domain/services/selector-matching.js'
import { type RuleEvaluatorParser } from '../../../domain/services/rule-evaluator.js'

/** Parsed artifact output eligible for cross-artifact rule evaluation. */
export interface ReadyArtifactParticipant {
  readonly artifactId: string
  readonly key: string
  readonly scope: 'spec' | 'change'
  readonly root: SelectorNode
  readonly parser: RuleEvaluatorParser
  readonly filename: string
}
