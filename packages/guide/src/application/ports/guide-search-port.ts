import type { GuideSearchHit } from '../../domain/models/index.js'

/**
 * Options for customizing guide search queries.
 */
export interface GuideSearchOptions {
  /**
   * Restrict search to a specific guide topic.
   */
  readonly topic?: string | undefined

  /**
   * Maximum number of search results to return (default: 5).
   */
  readonly limit?: number | undefined

  /**
   * Number of contextual lines before and after match to include in snippets (default: 3).
   */
  readonly snippetLines?: number | undefined
}

/**
 * Driven port for searching guide documents.
 */
export interface GuideSearchPort {
  /**
   * Executes a full-text search across indexed guide sections.
   *
   * @param query - Search query string.
   * @param options - Search configuration options.
   */
  search(query: string, options?: GuideSearchOptions): Promise<readonly GuideSearchHit[]>
}
