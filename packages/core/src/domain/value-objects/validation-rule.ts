import { type Selector } from './selector.js'

/** A structural validation constraint applied to an artifact's content. */
export interface ValidationRule {
  /** Unique identifier for this validation rule within its artifact. */
  readonly id?: string
  /** AST node selector that identifies the target node(s) to validate. */
  readonly selector?: Selector
  /** JSONPath expression targeting a value within the artifact (JSON/YAML formats). */
  readonly path?: string
  /** Whether the matched node must exist. Defaults to `true` when omitted. */
  readonly required?: boolean
  /** Regex pattern the rendered node content must match. */
  readonly contentMatches?: string
  /** Nested rules evaluated against the matched node's children. */
  readonly children?: readonly ValidationRule[]
}

/** A regex-based cleanup rule applied to artifact content before hashing. */
export interface PreHashCleanup {
  /** Unique identifier for this cleanup rule within its artifact. */
  readonly id?: string
  readonly pattern: string
  readonly replacement: string
}

/** Patterns used to determine whether an artifact's task list is complete. */
export interface TaskCompletionCheck {
  readonly incompletePattern?: string
  readonly completePattern?: string
}
