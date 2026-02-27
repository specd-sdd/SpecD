import { type Selector } from './selector.js'

/**
 *
 */
export interface ValidationRule {
  readonly selector?: Selector
  readonly path?: string
  readonly required?: boolean
  readonly contentMatches?: string
  readonly children?: readonly ValidationRule[]
}

/**
 *
 */
export interface ContextSection {
  readonly selector: Selector
  readonly role?: 'rules' | 'constraints' | 'scenarios' | 'context'
  readonly extract?: 'content' | 'label' | 'both'
  readonly contextTitle?: string
}

/**
 *
 */
export interface PreHashCleanup {
  readonly pattern: string
  readonly replacement: string
}

/**
 *
 */
export interface TaskCompletionCheck {
  readonly incompletePattern?: string
  readonly completePattern?: string
}
