import type { GuideCollection } from './guide-topic.js'

/**
 * Lightweight summary of a guide topic, used for catalog listings and directory tables.
 */
export interface GuideSummary {
  /**
   * Collection identifier the guide belongs to.
   */
  readonly collection: GuideCollection

  /**
   * Canonical topic identifier within its collection.
   */
  readonly topic: string

  /**
   * Human-readable title.
   */
  readonly title: string

  /**
   * Concise description.
   */
  readonly description: string

  /**
   * Navigation order (sidebar_position).
   */
  readonly order: number

  /**
   * Total number of lines.
   */
  readonly lineCount: number

  /**
   * Total UTF-8 byte length.
   */
  readonly byteLength: number
}
