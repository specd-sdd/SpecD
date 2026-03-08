export { applyPreHashCleanup } from './pre-hash-cleanup.js'
export { extractSpecSummary } from './spec-summary.js'
export { inferFormat } from './format-inference.js'
export { safeRegex } from './safe-regex.js'
export { shiftHeadings } from './shift-headings.js'
export {
  evaluateRules,
  selectNodes,
  selectBySelector,
  nodeMatches,
  collectNodes,
  selectByJsonPath,
  tokenizeJsonPath,
  recursiveCollect,
  type RuleEvaluationFailure,
  type RuleEvaluationWarning,
  type RuleEvaluationResult,
  type RuleEvaluatorNode,
  type RuleEvaluatorParser,
} from './rule-evaluator.js'
