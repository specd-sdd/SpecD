/**
 * Represents a single structural section within a guide document.
 */
export interface GuideSection {
  /**
   * 1-indexed sequential order of the section within the guide document.
   */
  readonly index: number

  /**
   * The text of the heading, excluding leading '#' characters and surrounding whitespace.
   */
  readonly heading: string

  /**
   * Heading depth level (e.g. 1 for '#', 2 for '##', 3 for '###').
   */
  readonly level: number

  /**
   * 1-indexed line number where the heading begins.
   */
  readonly startLine: number

  /**
   * 1-indexed line number where the section concludes (inclusive).
   */
  readonly endLine: number

  /**
   * Total number of lines in this section span (endLine - startLine + 1).
   */
  readonly lines: number

  /**
   * 0-indexed character start offset within the parent topic's content where the section begins.
   */
  readonly startOffset: number

  /**
   * 0-indexed character end offset within the parent topic's content where the section concludes.
   */
  readonly endOffset: number

  /**
   * Text content of the section, from the heading line up to endLine (optional or populated on-demand).
   */
  readonly content?: string
}
