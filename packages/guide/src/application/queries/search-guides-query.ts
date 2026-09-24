import type { GuideSearchHit } from '../../domain/models/index.js'
import type { GuideSearchOptions, GuideSearchPort } from '../ports/guide-search-port.js'

/**
 * Input parameters for executing full-text search across guides.
 */
export interface SearchGuidesInput {
  /** Search query string */
  readonly query: string
  /** Optional topic filter */
  readonly topic?: string | undefined
  /** Maximum number of hits to return */
  readonly limit?: number | undefined
  /** Number of context lines surrounding match in snippet */
  readonly snippetLines?: number | undefined
}

/**
 * Use case to execute full-text search across guide sections.
 */
export class SearchGuidesQuery {
  /**
   * Initializes the use case.
   *
   * @param searchPort - Search port adapter
   */
  constructor(private readonly searchPort: GuideSearchPort) {}

  /**
   * Searches indexed guides for the provided query string.
   *
   * @param input - Search query and optional topic filter, limit, and snippet lines.
   * @returns Array of ranked GuideSearchHit items.
   */
  async execute(input: SearchGuidesInput): Promise<readonly GuideSearchHit[]> {
    const trimmed = input.query.trim()
    if (!trimmed) {
      return []
    }

    const options: GuideSearchOptions = {
      topic: input.topic,
      limit: input.limit,
      snippetLines: input.snippetLines,
    }

    return this.searchPort.search(trimmed, options)
  }
}
