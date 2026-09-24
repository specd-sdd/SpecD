/**
 * Represents a ranked search result item from the guide search engine.
 */
export interface GuideSearchHit {
  /**
   * Topic identifier where the match was located.
   */
  readonly topic: string

  /**
   * Source filename (e.g. 'workflow.md').
   */
  readonly file: string

  /**
   * Heading text of the matched section.
   */
  readonly section: string

  /**
   * 1-indexed sequential index of the matched section within the guide document.
   */
  readonly sectionIndex: number

  /**
   * Heading depth level (e.g. 2 for '##').
   */
  readonly level: number

  /**
   * 1-indexed start line of the section in the source document.
   */
  readonly startLine: number

  /**
   * 1-indexed end line of the section in the source document.
   */
  readonly endLine: number

  /**
   * Relevance score computed by the BM25 algorithm.
   */
  readonly score: number

  /**
   * Line-numbered contextual snippet surrounding the match.
   */
  readonly snippet: string

  /**
   * Actionable copy-pasteable CLI command to view the section.
   */
  readonly readCommand: string
}
