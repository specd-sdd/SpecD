import MiniSearch from 'minisearch'
import type { GuideCatalogPort } from '../../application/ports/guide-catalog-port.js'
import type {
  GuideSearchOptions,
  GuideSearchPort,
} from '../../application/ports/guide-search-port.js'
import { formatWithLineNumbers } from '../../application/queries/slice-guide-lines.js'
import type { GuideSearchHit } from '../../domain/models/index.js'

/**
 * Internal indexable document representation of a guide section.
 */
interface SectionDocument {
  readonly id: string
  readonly topic: string
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
      storeFields: ['topic', 'title', 'heading', 'sectionIndex', 'level', 'startLine', 'endLine'],
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

    const guides = await this.catalogPort.getAllGuides()
    const docs: SectionDocument[] = []

    for (const guide of guides) {
      this.topicLines.set(guide.topic, guide.content.split(/\r?\n/))
      for (const section of guide.outline) {
        const doc: SectionDocument = {
          id: `${guide.topic}#${section.index}`,
          topic: guide.topic,
          title: guide.title,
          heading: section.heading,
          sectionIndex: section.index,
          level: section.level,
          startLine: section.startLine,
          endLine: section.endLine,
          content: section.content,
        }
        docs.push(doc)
        this.documents.set(doc.id, doc)
      }
    }

    ms.addAll(docs)
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

    const terms = queryLower.split(/\s+/).filter((t) => t.length > 0)
    if (terms.length === 0) {
      return startSearchIdx
    }

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

    const significantTerms = terms.filter((t) => !STOP_WORDS.has(t) && t.length > 1)
    const matchTerms = significantTerms.length > 0 ? significantTerms : terms

    let bestIdx = startSearchIdx
    let bestScore = -1

    for (let i = startSearchIdx; i <= endSearchIdx && i < lines.length; i++) {
      const lineLower = lines[i]!.toLowerCase()
      let score = 0

      // Exact full query substring match gets the highest priority
      if (lineLower.includes(queryLower)) {
        score += 1000 + queryLower.length * 10
      }

      // Significant term matches
      let matchedTermsCount = 0
      for (const term of matchTerms) {
        if (lineLower.includes(term)) {
          matchedTermsCount++
          score += 50 + term.length * 5
          const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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

      if (matchedTermsCount === matchTerms.length && matchTerms.length > 1) {
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
   * @param topic - The topic identifier of the guide
   * @param sectionStartLine - 1-indexed starting line number of the section
   * @param sectionEndLine - 1-indexed ending line number of the section
   * @param sectionContent - Fallback section content
   * @param query - The search query to locate matches for
   * @param contextLinesCount - Number of context lines surrounding the match
   * @returns Formatted snippet with line numbers
   */
  private generateSnippet(
    topic: string,
    sectionStartLine: number,
    sectionEndLine: number,
    sectionContent: string,
    query: string,
    contextLinesCount: number,
  ): string {
    const fullDocLines = this.topicLines.get(topic)
    const useDocLines =
      fullDocLines !== undefined && fullDocLines.length >= sectionEndLine && sectionStartLine >= 1

    const lines = useDocLines ? fullDocLines : sectionContent.split(/\r?\n/)
    if (lines.length === 0) return ''

    const startSearchIdx = useDocLines ? sectionStartLine - 1 : 0
    const endSearchIdx = useDocLines
      ? Math.min(lines.length - 1, sectionEndLine - 1)
      : lines.length - 1

    const matchIdx = this.findBestMatchLine(lines, startSearchIdx, endSearchIdx, query)

    const sliceStartIdx = Math.max(0, matchIdx - contextLinesCount)
    const sliceEndIdx = Math.min(lines.length - 1, matchIdx + contextLinesCount)
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

    let rawResults = ms.search(trimmed)

    if (options?.topic) {
      const topicFilter = options.topic.trim().toLowerCase().replace(/\.md$/, '')
      rawResults = rawResults.filter((r) => r['topic'] === topicFilter)
    }

    const slicedResults = rawResults.slice(0, limit)
    const hits: GuideSearchHit[] = []

    for (const result of slicedResults) {
      const doc = this.documents.get(String(result.id))
      if (!doc) continue

      const snippet = this.generateSnippet(
        doc.topic,
        doc.startLine,
        doc.endLine,
        doc.content,
        trimmed,
        snippetLinesCount,
      )

      hits.push({
        topic: doc.topic,
        file: `${doc.topic}.md`,
        section: doc.heading,
        sectionIndex: doc.sectionIndex,
        level: doc.level,
        startLine: doc.startLine,
        endLine: doc.endLine,
        score: result.score,
        snippet,
        readCommand: `specd guide ${doc.topic} --section ${doc.sectionIndex}`,
      })
    }

    return hits
  }
}
