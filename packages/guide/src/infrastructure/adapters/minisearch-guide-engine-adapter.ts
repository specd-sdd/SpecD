import MiniSearch, { type SearchResult } from 'minisearch'
import type { GuideCatalogPort } from '../../application/ports/guide-catalog-port.js'
import type {
  GuideSearchOptions,
  GuideSearchPort,
} from '../../application/ports/guide-search-port.js'
import { formatWithLineNumbers } from '../../application/queries/slice-guide-lines.js'
import type { GuideSearchHit } from '../../domain/models/index.js'
import type { GuideTopic } from '../../domain/models/guide-topic.js'
import { expandGuideTerms } from '../../domain/services/expand-guide-terms.js'
import { normalizeTopicRef } from '../../domain/topic-identity.js'

/**
 * Internal indexable document representation of a guide section.
 */
interface SectionDocument {
  readonly id: string
  readonly collection: string
  readonly topic: string
  readonly sourcePath: string
  readonly title: string
  readonly heading: string
  readonly sectionIndex: number
  readonly level: number
  readonly startLine: number
  readonly endLine: number
  readonly content: string
}

/**
 * In-memory BM25 search engine adapter utilizing MiniSearch.
 */
export class MiniSearchGuideEngineAdapter implements GuideSearchPort {
  private miniSearch: MiniSearch<SectionDocument> | null = null
  private readonly documents: Map<string, SectionDocument> = new Map()
  private readonly topicLines: Map<string, readonly string[]> = new Map()
  private isIndexReady = false

  /**
   * Initializes the search adapter.
   *
   * @param catalogPort - Catalog port for loading all guide topics
   */
  constructor(private readonly catalogPort: GuideCatalogPort) {}

  /**
   * Builds the MiniSearch BM25 index on-demand if not already cached.
   *
   * @returns Ready MiniSearch instance
   */
  private async ensureIndex(): Promise<MiniSearch<SectionDocument>> {
    if (this.isIndexReady && this.miniSearch) {
      return this.miniSearch
    }

    const ms = new MiniSearch<SectionDocument>({
      fields: ['title', 'heading', 'content'],
      storeFields: [
        'collection',
        'topic',
        'sourcePath',
        'title',
        'heading',
        'sectionIndex',
        'level',
        'startLine',
        'endLine',
      ],
      tokenize: expandGuideTerms,
      searchOptions: {
        boost: {
          title: 5,
          heading: 3,
          content: 1,
        },
        prefix: true,
        fuzzy: 0.2,
      },
    })

    const guides = await this.catalogPort.getAllTopics()
    const docs: SectionDocument[] = []

    for (const guide of guides) {
      const qualified = `${guide.collection}:${guide.topic}`
      this.topicLines.set(qualified, guide.content.split(/\r?\n/))
      for (const section of guide.outline) {
        const sectionContent = extractSectionContent(guide, section)

        const doc: SectionDocument = {
          id: `${qualified}#${section.index}`,
          collection: guide.collection,
          topic: guide.topic,
          sourcePath: guide.sourcePath,
          title: guide.title,
          heading: section.heading,
          sectionIndex: section.index,
          level: section.level,
          startLine: section.startLine,
          endLine: section.endLine,
          content: sectionContent,
        }
        docs.push(doc)
        this.documents.set(doc.id, doc)
      }
    }

    if (docs.length > 0) {
      ms.addAll(docs)
    }
    this.miniSearch = ms
    this.isIndexReady = true
    return ms
  }

  /**
   * Locates the best matching line within the section search range.
   *
   * @param lines - All available lines
   * @param startSearchIdx - 0-indexed start of section line range
   * @param endSearchIdx - 0-indexed end of section line range
   * @param query - The search query
   * @returns 0-indexed line index of the best match
   */
  private findBestMatchLine(
    lines: readonly string[],
    startSearchIdx: number,
    endSearchIdx: number,
    query: string,
  ): number {
    const queryLower = query.toLowerCase().trim()
    if (!queryLower) {
      return startSearchIdx
    }

    const terms = expandGuideTerms(queryLower)
    if (terms.length === 0) {
      return startSearchIdx
    }

    const matchTerms = terms.filter((t) => !STOP_WORDS.has(t) && t.length > 1)
    const effectiveTerms = matchTerms.length > 0 ? matchTerms : terms

    let bestIdx = startSearchIdx
    let bestScore = -1

    for (let i = startSearchIdx; i <= endSearchIdx && i < lines.length; i++) {
      const lineLower = lines[i]!.toLowerCase()
      let score = 0

      // Exact full query substring match gets the highest priority
      if (lineLower.includes(queryLower)) {
        score += 1000 + queryLower.length * 10
      }

      let matchedTermsCount = 0
      for (const term of effectiveTerms) {
        if (lineLower.includes(term)) {
          matchedTermsCount++
          score += 50 + term.length * 5
          const escaped = escapeRegExp(term)
          if (new RegExp(`\\b${escaped}\\b`, 'i').test(lineLower)) {
            score += 30
          }
        } else if (term.length >= 3) {
          const words = lineLower.split(/\W+/)
          if (words.some((w) => w.startsWith(term) || term.startsWith(w))) {
            matchedTermsCount++
            score += 20
          }
        }
      }

      if (matchedTermsCount === effectiveTerms.length && effectiveTerms.length > 1) {
        score += 300
      }

      if (score > bestScore) {
        bestScore = score
        bestIdx = i
      }
    }

    return bestIdx
  }

  /**
   * Generates a contextual snippet around matching text with lines before and after.
   *
   * @param qualified - The `collection:topic` identity of the guide
   * @param sectionStartLine - 1-indexed starting line number of the section
   * @param sectionEndLine - 1-indexed ending line number of the section
   * @param sectionContent - Fallback section content
   * @param query - The search query to locate matches for
   * @param contextLinesCount - Number of context lines surrounding the match
   * @returns Formatted snippet with line numbers
   */
  private generateSnippet(
    qualified: string,
    sectionStartLine: number,
    sectionEndLine: number,
    sectionContent: string,
    query: string,
    contextLinesCount: number,
  ): string {
    const fullDocLines = this.topicLines.get(qualified)
    const useDocLines =
      fullDocLines !== undefined && fullDocLines.length >= sectionEndLine && sectionStartLine >= 1

    const lines = useDocLines ? fullDocLines : sectionContent.split(/\r?\n/)
    if (lines.length === 0) return ''

    const startSearchIdx = useDocLines ? sectionStartLine - 1 : 0
    const endSearchIdx = useDocLines
      ? Math.min(lines.length - 1, sectionEndLine - 1)
      : lines.length - 1

    const matchIdx = this.findBestMatchLine(lines, startSearchIdx, endSearchIdx, query)

    const sliceStartIdx = Math.max(startSearchIdx, matchIdx - contextLinesCount)
    const sliceEndIdx = Math.min(endSearchIdx, matchIdx + contextLinesCount)
    const snippetSlice = lines.slice(sliceStartIdx, sliceEndIdx + 1).join('\n')
    const snippetStartLineNumber = useDocLines
      ? sliceStartIdx + 1
      : sectionStartLine + sliceStartIdx

    return formatWithLineNumbers(snippetSlice, snippetStartLineNumber)
  }

  /**
   * Executes full-text BM25 search across all indexed sections.
   *
   * @param query - The query string to search for
   * @param options - Optional search limits, filters, and snippet settings
   * @returns Array of search hit descriptors
   */
  async search(query: string, options?: GuideSearchOptions): Promise<readonly GuideSearchHit[]> {
    const trimmed = query.trim()
    if (!trimmed) {
      return []
    }

    const ms = await this.ensureIndex()
    const limit = options?.limit !== undefined && options.limit > 0 ? options.limit : 5
    const snippetLinesCount =
      options?.snippetLines !== undefined && options.snippetLines >= 0 ? options.snippetLines : 3

    let rawResults: SearchResult[] = safeSearch(ms, trimmed)

    const topicFilter = buildTopicFilter(options?.topic)
    if (topicFilter !== undefined) {
      rawResults = rawResults.filter((r) => {
        const doc = this.documents.get(String(r.id))
        return doc !== undefined && topicFilter(doc)
      })
    }

    if (options?.collections !== undefined && options.collections.length > 0) {
      const allowed = new Set(options.collections.map((c) => c.toLowerCase()))
      rawResults = rawResults.filter((r) => {
        const doc = this.documents.get(String(r.id))
        return doc !== undefined && allowed.has(doc.collection)
      })
    }

    const rankedResults = rankExactQueryMatches(rawResults, this.documents, trimmed)
    const slicedResults = rankedResults.slice(0, limit)
    const hits: GuideSearchHit[] = []

    for (const result of slicedResults) {
      const doc = this.documents.get(String(result.id))
      if (!doc) continue

      const qualified = `${doc.collection}:${doc.topic}`
      const snippet = this.generateSnippet(
        qualified,
        doc.startLine,
        doc.endLine,
        doc.content,
        trimmed,
        snippetLinesCount,
      )

      hits.push({
        collection: doc.collection,
        topic: doc.topic,
        file: doc.sourcePath,
        section: doc.heading,
        sectionIndex: doc.sectionIndex,
        level: doc.level,
        startLine: doc.startLine,
        endLine: doc.endLine,
        score: result.score,
        snippet,
        readCommand: `${commandForCollection(doc.collection)} ${topicAddress(doc.collection, doc.topic)} --section ${doc.sectionIndex}`,
      })
    }

    return hits
  }
}

/**
 * Promotes documents containing the complete query before result limiting.
 *
 * MiniSearch provides BM25-ranked results, but a title or heading with separate query
 * terms can otherwise displace a lower-scoring section that contains the user's whole
 * query. The stable sort preserves MiniSearch's score order within the exact and
 * non-exact groups.
 *
 * @param results - BM25-ranked results after all filters have been applied.
 * @param documents - Indexed documents keyed by MiniSearch identifier.
 * @param query - Non-empty, trimmed query text.
 * @returns Results with exact full-query matches promoted ahead of partial matches.
 */
function rankExactQueryMatches(
  results: readonly SearchResult[],
  documents: ReadonlyMap<string, SectionDocument>,
  query: string,
): SearchResult[] {
  const normalizedQuery = query.toLocaleLowerCase()
  return [...results].sort((left, right) => {
    const leftExact = isExactQueryMatch(documents.get(String(left.id)), normalizedQuery)
    const rightExact = isExactQueryMatch(documents.get(String(right.id)), normalizedQuery)
    return Number(rightExact) - Number(leftExact)
  })
}

/**
 * Determines whether an indexed section contains the complete normalized query.
 *
 * @param document - Indexed section document, if its result identifier is still available.
 * @param normalizedQuery - Trimmed, locale-lowercased query text.
 * @returns `true` when title, heading, or content contains the full query.
 */
function isExactQueryMatch(
  document: SectionDocument | undefined,
  normalizedQuery: string,
): boolean {
  if (document === undefined) return false
  return [document.title, document.heading, document.content].some((field) =>
    field.toLocaleLowerCase().includes(normalizedQuery),
  )
}

/**
 * Escapes a string for literal use inside a regular expression.
 *
 * @param value - Raw term.
 * @returns The escaped term.
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Runs a MiniSearch query, retrying with a literal form when the raw query contains
 * syntax MiniSearch cannot parse.
 *
 * @param ms - The initialized index.
 * @param query - Raw user query.
 * @returns Search results, possibly empty.
 */
function safeSearch(ms: MiniSearch<SectionDocument>, query: string): SearchResult[] {
  try {
    return ms.search(query)
  } catch {
    try {
      return ms.search(`"${escapeRegExp(query)}"`)
    } catch {
      return []
    }
  }
}

/**
 * Extracts a section's text from a topic, preferring stored content over offsets.
 *
 * @param guide - The parent topic.
 * @param section - The section descriptor.
 * @returns The section's Markdown text.
 */
function extractSectionContent(guide: GuideTopic, section: GuideTopic['outline'][number]): string {
  if (section.content !== undefined) {
    return section.content
  }
  if (typeof section.startOffset === 'number' && typeof section.endOffset === 'number') {
    return guide.content.slice(section.startOffset, section.endOffset)
  }
  return guide.content
    .split(/\r?\n/)
    .slice(section.startLine - 1, section.endLine)
    .join('\n')
}

/**
 * Builds a topic predicate from normalized filter values.
 *
 * A bare value matches the topic in any collection; a `collection:topic` value
 * matches only that collection.
 *
 * @param topics - Filter value or values, either bare or collection-qualified.
 * @returns A predicate, or undefined when no filter was supplied.
 */
function buildTopicFilter(
  topics: string | readonly string[] | undefined,
): ((doc: SectionDocument) => boolean) | undefined {
  if (topics === undefined) {
    return undefined
  }

  const values = typeof topics === 'string' ? [topics] : topics
  if (values.length === 0) {
    return undefined
  }

  const refs = values.map((t) => normalizeTopicRef(t))
  return (doc) =>
    refs.some((ref) =>
      ref.collection === undefined
        ? doc.topic === ref.topic
        : doc.collection === ref.collection && doc.topic === ref.topic,
    )
}

/**
 * Collection served by the main `specd guide` command.
 */
const USER_COLLECTION = 'guide'

/**
 * Derives the fully-qualified topic address a caller passes to the CLI.
 *
 * The user guide collection is addressed by its bare topic because `specd guide` serves
 * exactly one collection; every other collection requires the explicit collection
 * prefix to stay unambiguous.
 *
 * @param collection - Collection identifier.
 * @param topic - Bare topic identifier.
 * @returns Topic address suitable for the command line.
 */
function topicAddress(collection: string, topic: string): string {
  return collection === USER_COLLECTION ? topic : `${collection}:${topic}`
}

/**
 * Derives the CLI command name for a collection.
 *
 * The user guide collection is served by `specd guide`; every other collection is
 * served by the SDK collection's `specd guide-sdk`.
 *
 * @param collection - Collection identifier.
 * @returns The command a hit in that collection should be read with.
 */
function commandForCollection(collection: string): string {
  return collection === USER_COLLECTION ? 'specd guide' : 'specd guide-sdk'
}

/**
 * Common English stop words used only to prioritize snippet line selection.
 *
 * These words never prefilter results, so a query consisting solely of stop words
 * still matches documents.
 */
const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'with',
  'by',
  'from',
  'is',
  'are',
  'was',
  'were',
  'it',
  'this',
  'that',
  'as',
  'be',
  'into',
  'all',
  'any',
  'if',
])
