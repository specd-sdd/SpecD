import type { GuideSection } from './guide-section.js'

/**
 * Represents a complete user guide entity.
 */
export interface GuideTopic {
  /**
   * Unique topic identifier corresponding to the filename without extension (e.g. 'getting-started').
   */
  readonly topic: string

  /**
   * Human-readable title extracted from YAML frontmatter.
   */
  readonly title: string

  /**
   * Concise description extracted from YAML frontmatter.
   */
  readonly description: string

  /**
   * Presentation and navigation order extracted from YAML frontmatter sidebar_position.
   */
  readonly order: number

  /**
   * Complete raw Markdown text of the guide document.
   */
  readonly content: string

  /**
   * Total number of lines in the document.
   */
  readonly lineCount: number

  /**
   * Total UTF-8 byte length of the content.
   */
  readonly byteLength: number

  /**
   * Pre-calculated outline of all sections within the guide.
   */
  readonly outline: readonly GuideSection[]
}
