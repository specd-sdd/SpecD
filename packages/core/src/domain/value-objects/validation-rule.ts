import { type Selector } from './selector.js'

/** A structural validation constraint applied to an artifact's content. */
export interface ValidationRule {
  readonly selector?: Selector
  readonly path?: string
  readonly required?: boolean
  readonly contentMatches?: string
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
