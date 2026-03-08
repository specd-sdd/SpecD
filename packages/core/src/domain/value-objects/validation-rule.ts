import { type Selector } from './selector.js'

/** A structural validation constraint applied to an artifact's content. */
export interface ValidationRule {
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

/** A section of an artifact to extract as context for downstream consumers. */
export interface ContextSection {
  readonly selector: Selector
  readonly role?: 'rules' | 'constraints' | 'scenarios' | 'context'
  readonly extract?: 'content' | 'label' | 'both'
  readonly contextTitle?: string
}

/** A regex-based cleanup rule applied to artifact content before hashing. */
export interface PreHashCleanup {
  readonly pattern: string
  readonly replacement: string
}

/** Patterns used to determine whether an artifact's task list is complete. */
export interface TaskCompletionCheck {
  readonly incompletePattern?: string
  readonly completePattern?: string
}
