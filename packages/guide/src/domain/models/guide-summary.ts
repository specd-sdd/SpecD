/**
 * Lightweight summary of a guide topic, used for catalog listings and directory tables.
 */
export interface GuideSummary {
  /**
   * Topic identifier.
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
