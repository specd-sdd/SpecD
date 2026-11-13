import type { GuideSummary } from '../../domain/models/guide-summary.js'
import type { GuideCollection } from '../../domain/models/guide-topic.js'
import { isGeneratedTopic, isValidCollectionId } from '../../domain/topic-identity.js'
import type { GuideCatalogPort } from '../ports/guide-catalog-port.js'

/**
 * Scope predicate restricting the returned topic set.
 */
export type GuideListScope = Readonly<Record<string, unknown>>

/**
 * Pagination controls for a guide listing.
 */
export interface GuidePagination {
  /**
   * 1-indexed page to return. Pages before the first page are clamped to 1.
   */
  readonly page: number

  /**
   * Maximum number of topics per page. Values below 1 are clamped to 1.
   */
  readonly pageSize: number
}

/**
 * Parameters accepted by {@link ListGuidesQuery.execute}.
 */
export interface ListGuidesQueryParams {
  /**
   * Optional predicate selecting a subset of the catalog's topics.
   *
   * When omitted, the query MUST return every topic in the catalog so that the
   * CLI's `--meta` listing exposes generated API topics as well as hand-written
   * documents.
   */
  readonly scope?: GuideListScope

  /**
   * Optional pagination window applied after filtering and ordering.
   */
  readonly pagination?: GuidePagination
}

/**
 * Kind of document a topic describes.
 *
 * This is the dimension a listing scope filters on, and it is distinct from the
 * collection the topic comes from: a generated symbol in the `sdk` collection has
 * `scope` `api` and `collection` `sdk`.
 */
export type GuideTopicScope = 'docs' | 'api'

/**
 * A topic summary together with the page it appears on.
 */
export interface GuideListedTopic extends GuideSummary {
  /**
   * 1-indexed page this topic is returned on under the active page size.
   */
  readonly page: number

  /**
   * Whether this topic is a hand-written document or a generated API topic.
   *
   * Reported on every entry so a caller does not have to infer it from the topic path.
   */
  readonly scope: GuideTopicScope
}

/**
 * Page window coordinates for a guide listing.
 */
export interface GuidePaginationInfo {
  /** 1-indexed page that was returned. */
  readonly page: number
  /** Page size that produced the window. */
  readonly pageSize: number
  /** Number of topics on the returned page. */
  readonly returned: number
  /** Number of topics matching the scope across every page. */
  readonly total: number
  /** Number of pages the scoped result spans. */
  readonly totalPages: number
}

/**
 * Location of one collection within a paginated listing.
 */
export interface GuideCollectionExtent {
  /** Collection identifier. */
  readonly collection: string
  /** Number of topics the scope returns for this collection. */
  readonly total: number
  /** 1-indexed first page on which this collection's topics appear. */
  readonly firstPage: number
  /** 1-indexed last page on which this collection's topics appear. */
  readonly lastPage: number
}

/**
 * Topics suppressed by the active scope.
 */
export interface GuideWithheldTopics {
  /**
   * Number of generated API topics in the catalog that the active scope excludes.
   *
   * A caller can reveal them by widening the scope, so the count is reported rather
   * than silently withheld.
   */
  readonly generatedTopics: number
}

/**
 * Result of a guide listing: one page of topics plus the coordinates needed to
 * locate everything the scope excludes from that page.
 */
export interface GuideListingResult {
  /** Topics on the returned page, each carrying its `page`. */
  readonly topics: readonly GuideListedTopic[]
  /** Page window coordinates. */
  readonly pagination: GuidePaginationInfo
  /** Per-collection extents across every page of the scoped result. */
  readonly collections: readonly GuideCollectionExtent[]
  /** Topics the active scope withholds. Absent when nothing is withheld. */
  readonly withheld?: GuideWithheldTopics
}

/**
 * Query handler for retrieving a paginated list of guide topic summaries.
 */
export class ListGuidesQuery {
  private readonly catalog: GuideCatalogPort

  /**
   * Creates a new ListGuidesQuery.
   *
   * @param catalog - The catalog port supplying guide topics.
   */
  constructor(catalog: GuideCatalogPort) {
    this.catalog = catalog
  }

  /**
   * Retrieves the summaries that satisfy the scope and pagination window.
   *
   * Results are ordered by `collection` first, then by `order`, then by `topic`,
   * using locale-aware comparison so ordering is stable and human-readable.
   *
   * Alongside the returned page, the result reports the page coordinates, the
   * per-collection extents and the count of generated topics the scope withholds,
   * so that a caller can locate a topic without walking every page.
   *
   * @param params - Optional scope and pagination controls.
   * @returns The returned page plus its pagination and collection coordinates.
   */
  async execute(params: ListGuidesQueryParams = {}): Promise<GuideListingResult> {
    const all = await this.catalog.getAllGuides()
    const scoped =
      params.scope === undefined
        ? all
        : all.filter((s) => matchesScope(s, params.scope as GuideListScope))
    const ordered = [...scoped].sort(compareSummaries)

    const total = ordered.length
    const pageSize = normalizePageSize(params.pagination?.pageSize, total)
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const page = clampPage(params.pagination?.page, totalPages)

    const pageOf = (index: number): number => Math.floor(index / pageSize) + 1
    const start = (page - 1) * pageSize
    const topics: GuideListedTopic[] = ordered
      .slice(start, start + pageSize)
      .map((summary, offset) => ({
        ...summary,
        page: pageOf(start + offset),
        scope: isGenerated(summary) ? ('api' as const) : ('docs' as const),
      }))

    const withheldGenerated = all.filter(isGenerated).length - ordered.filter(isGenerated).length

    return {
      topics,
      pagination: { page, pageSize, returned: topics.length, total, totalPages },
      collections: collectionExtents(ordered, pageSize),
      ...(withheldGenerated > 0 ? { withheld: { generatedTopics: withheldGenerated } } : {}),
    }
  }

  /**
   * Retrieves every collection identifier present in the catalog.
   *
   * @returns The collection identifiers.
   */
  async collections(): Promise<readonly GuideCollection[]> {
    return this.catalog.getCollections()
  }
}

const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true })

/**
 * Normalizes a requested page size, falling back to the full result when unbounded.
 *
 * @param requested - Raw requested page size.
 * @param total - Number of topics matching the scope.
 * @returns A page size of at least 1.
 */
function normalizePageSize(requested: number | undefined, total: number): number {
  if (requested === undefined || !Number.isFinite(requested)) {
    return Math.max(1, total)
  }
  return Math.max(1, Math.trunc(requested))
}

/**
 * Clamps a requested page into the available range.
 *
 * @param requested - Raw requested page.
 * @param totalPages - Number of pages the scoped result spans.
 * @returns A page between 1 and `totalPages`.
 */
function clampPage(requested: number | undefined, totalPages: number): number {
  if (requested === undefined || !Number.isFinite(requested)) {
    return 1
  }
  return Math.min(Math.max(1, Math.trunc(requested)), totalPages)
}

/**
 * Computes where each collection sits across the pages of a scoped result.
 *
 * @param ordered - Scoped summaries in final order.
 * @param pageSize - Page size the result is paginated by.
 * @returns One extent per collection, in the order the collections first appear.
 */
function collectionExtents(
  ordered: readonly GuideSummary[],
  pageSize: number,
): readonly GuideCollectionExtent[] {
  const pageOf = (index: number): number => Math.floor(index / pageSize) + 1
  const extents = new Map<string, GuideCollectionExtent>()

  ordered.forEach((summary, index) => {
    const page = pageOf(index)
    const existing = extents.get(summary.collection)
    if (existing === undefined) {
      extents.set(summary.collection, {
        collection: summary.collection,
        total: 1,
        firstPage: page,
        lastPage: page,
      })
      return
    }
    extents.set(summary.collection, {
      ...existing,
      total: existing.total + 1,
      lastPage: page,
    })
  })

  return [...extents.values()]
}

/**
 * Orders summaries by collection, then navigation order, then topic.
 *
 * @param a - Left summary.
 * @param b - Right summary.
 * @returns A negative, zero, or positive sort position.
 */
function compareSummaries(a: GuideSummary, b: GuideSummary): number {
  const byCollection = collator.compare(a.collection, b.collection)
  if (byCollection !== 0) return byCollection
  const byOrder = a.order - b.order
  if (byOrder !== 0) return byOrder
  return collator.compare(a.topic, b.topic)
}

/**
 * Tests a summary against a scope predicate.
 *
 * A scope narrows the catalog by collection identity and by topic identity. Every
 * key present in the scope must match for the summary to be included, so an empty
 * scope object selects every topic.
 *
 * @param summary - Summary under test.
 * @param scope - Scope predicate.
 * @returns True when the summary satisfies the scope.
 */
function matchesScope(summary: GuideSummary, scope: GuideListScope): boolean {
  return Object.entries(scope).every(([key, expected]) => {
    if (key === 'collection' || key === 'collections') {
      return matchesCollection(summary.collection, expected)
    }
    if (key === 'topic' || key === 'topics') {
      return matchesTopic(summary, expected)
    }
    if (key === 'collectionTopic' || key === 'collectionTopics') {
      return matchesCollectionTopic(summary, expected)
    }
    if (key === 'generated') {
      return expected === false ? !isGenerated(summary) : isGenerated(summary)
    }
    return true
  })
}

/**
 * Tests a collection identifier against a single value or a list of values.
 *
 * @param collection - The summary's collection.
 * @param expected - Expected value or values.
 * @returns True when the collection is included.
 */
function matchesCollection(collection: string, expected: unknown): boolean {
  if (typeof expected === 'string') {
    return collection === expected
  }
  if (Array.isArray(expected)) {
    return expected.some(
      (value) => isValidCollectionId(String(value)) && collection === String(value),
    )
  }
  return true
}

/**
 * Tests a topic against a single value or a list of values.
 *
 * @param summary - The summary under test.
 * @param expected - Expected value or values.
 * @returns True when the topic is included.
 */
function matchesTopic(summary: GuideSummary, expected: unknown): boolean {
  if (typeof expected === 'string') {
    return summary.topic === expected
  }
  if (Array.isArray(expected)) {
    return expected.some((value) => summary.topic === String(value))
  }
  return true
}

/**
 * Tests whether a summary describes a generated API topic.
 *
 * @param summary - Summary under test.
 * @returns True when the summary describes a generated API topic.
 */
function isGenerated(summary: GuideSummary): boolean {
  return isGeneratedTopic(summary.topic)
}

/**
 * Tests a collection-qualified identity against a single value or a list of values.
 *
 * @param summary - The summary under test.
 * @param expected - Expected `collection:topic` value or values.
 * @returns True when the qualified identity is included.
 */
function matchesCollectionTopic(summary: GuideSummary, expected: unknown): boolean {
  const qualified = `${summary.collection}:${summary.topic}`
  if (typeof expected === 'string') {
    return qualified === expected
  }
  if (Array.isArray(expected)) {
    return expected.some((value) => qualified === String(value))
  }
  return true
}
