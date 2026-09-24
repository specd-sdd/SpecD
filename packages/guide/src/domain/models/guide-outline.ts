import type { GuideSection } from './guide-section.js'

/**
 * Structural outline map of a guide document.
 */
export interface GuideOutline {
  /**
   * Topic identifier.
   */
  readonly topic: string

  /**
   * Source filename (e.g. 'getting-started.md').
   */
  readonly file: string

  /**
   * Total number of lines in the document.
   */
  readonly lines: number

  /**
   * Total UTF-8 byte length of the document.
   */
  readonly bytes: number

  /**
   * Array of structural section descriptors.
   */
  readonly sections: readonly GuideSection[]
}
