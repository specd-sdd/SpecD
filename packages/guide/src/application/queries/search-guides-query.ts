import type { GuideSearchHit } from '../../domain/models/index.js'
import { normalizeTopicRef } from '../../domain/topic-identity.js'
import type { GuideSearchOptions, GuideSearchPort } from '../ports/guide-search-port.js'

/**
 * Input parameters for executing full-text search across guides.
 */
export interface SearchGuidesInput {
  /** Search query string */
  readonly query: string
  /** Optional topic filter */
  readonly topic?: string | readonly string[] | undefined
  /** Optional collection filter */
  readonly collection?: string | string[] | undefined
  /** Alias for `collection`, matching the search port option name */
  readonly collections?: readonly string[] | undefined
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
   * @param input - Search query and optional topic, collection, limit, and snippet lines.
   * @returns Array of ranked GuideSearchHit items.
   */
  async execute(input: SearchGuidesInput): Promise<readonly GuideSearchHit[]> {
    const trimmed = input.query.trim()
    if (!trimmed) {
      return []
    }

    const options: GuideSearchOptions = {
      topic: normalizeTopics(input.topic),
      collections: input.collections ?? toArray(input.collection),
      limit: input.limit,
      snippetLines: input.snippetLines,
    }

    return this.searchPort.search(trimmed, options)
  }
}

/**
 * Normalizes a topic filter into a list of comparison keys.
 *
 * Each supplied value is normalized with the same rules used for topic
 * resolution, so a filter and a lookup agree on the identity they compare.
 *
 * @param topic - Raw topic filter value or values.
 * @returns The normalized filter list, or undefined when no filter was supplied.
 */
function normalizeTopics(
  topic: string | readonly string[] | undefined,
): readonly string[] | undefined {
  if (topic === undefined) {
    return undefined
  }
  const values = typeof topic === 'string' ? [topic] : topic
  return values.map((value) => {
    const ref = normalizeTopicRef(value)
    return ref.collection === undefined ? ref.topic : `${ref.collection}:${ref.topic}`
  })
}

/**
 * Normalizes a scalar or list filter into a plain array.
 *
 * @param value - Raw filter value or values.
 * @returns The array form, or undefined when no filter was supplied.
 */
function toArray(value: string | string[] | undefined): readonly string[] | undefined {
  if (value === undefined) {
    return undefined
  }
  return Array.isArray(value) ? value : [value]
}
