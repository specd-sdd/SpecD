import type { GuideCatalogPort } from '../application/ports/guide-catalog-port.js'
import type { GuideSearchOptions, GuideSearchPort } from '../application/ports/guide-search-port.js'
import {
  GetGuideOutlineQuery,
  GetGuideQuery,
  GetGuideSectionQuery,
  ListGuidesQuery,
  SearchGuidesQuery,
  formatWithLineNumbers,
  sliceGuideLines,
} from '../application/queries/index.js'
import type {
  GuideListingResult,
  GuidePagination,
  GuideListScope,
} from '../application/queries/list-guides-query.js'
import type {
  GuideOutline,
  GuideSearchHit,
  GuideSection,
  GuideTopic,
} from '../domain/models/index.js'
import type { GuideCollection } from '../domain/models/guide-topic.js'
import { MiniSearchGuideEngineAdapter } from '../infrastructure/adapters/minisearch-guide-engine-adapter.js'
import { PrebundledGuideCatalogAdapter } from '../infrastructure/adapters/prebundled-guide-catalog-adapter.js'

/**
 * Configuration options for creating a GuideEngine instance.
 */
export interface GuideEngineOptions {
  /** Optional catalog port override */
  readonly catalogPort?: GuideCatalogPort | undefined
  /** Optional search port override */
  readonly searchPort?: GuideSearchPort | undefined
}

/**
 * Public facade interface for interacting with SpecD guides and documentation search.
 */
export interface GuideEngine {
  listGuides(options?: ListGuidesOptions): Promise<GuideListingResult>
  getCollections(): Promise<readonly GuideCollection[]>
  getGuide(topic: string): Promise<GuideTopic>
  getGuideOutline(topic: string): Promise<GuideOutline>
  getGuideSection(topic: string, section: string | number): Promise<GuideSection>
  sliceGuideLines(content: string, startLine?: number, lineCount?: number): string
  formatWithLineNumbers(content: string, startLine?: number): string
  searchGuides(query: string, options?: GuideSearchOptions): Promise<readonly GuideSearchHit[]>
}

/**
 * Scope and pagination controls accepted by a guide listing.
 */
export interface ListGuidesOptions {
  /** Predicate narrowing the returned topics. */
  readonly scope?: GuideListScope
  /** Page window applied after filtering and ordering. */
  readonly pagination?: GuidePagination
}

/**
 * Assembles a GuideEngine from a catalog port and a search port.
 *
 * @param catalogPort - Port serving exactly one catalog.
 * @param searchPort - Port providing full-text search over that catalog.
 * @returns Configured GuideEngine facade.
 */
export function assembleGuideEngine(
  catalogPort: GuideCatalogPort,
  searchPort: GuideSearchPort,
): GuideEngine {
  const listGuidesQuery = new ListGuidesQuery(catalogPort)
  const getGuideQuery = new GetGuideQuery(catalogPort)
  const getGuideOutlineQuery = new GetGuideOutlineQuery(catalogPort)
  const getGuideSectionQuery = new GetGuideSectionQuery(catalogPort)
  const searchGuidesQuery = new SearchGuidesQuery(searchPort)

  return {
    listGuides: (options?: ListGuidesOptions) => listGuidesQuery.execute(options ?? {}),
    getCollections: () => listGuidesQuery.collections(),
    getGuide: (topic: string) => getGuideQuery.execute({ topic }),
    getGuideOutline: (topic: string) => getGuideOutlineQuery.execute({ topic }),
    getGuideSection: (topic: string, section: string | number) =>
      getGuideSectionQuery.execute({ topic, section }),
    sliceGuideLines: (content: string, startLine?: number, lineCount?: number) =>
      sliceGuideLines(content, startLine, lineCount),
    formatWithLineNumbers: (content: string, startLine?: number) =>
      formatWithLineNumbers(content, startLine),
    searchGuides: (query: string, searchOptions?: GuideSearchOptions) =>
      searchGuidesQuery.execute({
        query,
        topic: searchOptions?.topic,
        collections: searchOptions?.collections,
        limit: searchOptions?.limit,
        snippetLines: searchOptions?.snippetLines,
      }),
  }
}

/**
 * Factory function creating a fully assembled GuideEngine instance.
 *
 * The default engine serves the user guide catalog and does NOT load the SDK
 * collection; use the `./sdk` subpath for that catalog.
 *
 * @param options - Optional port overrides for custom testing or catalog sources.
 * @returns Configured GuideEngine facade.
 */
export function createGuideEngine(options?: GuideEngineOptions): GuideEngine {
  const catalogPort =
    options?.catalogPort ?? new PrebundledGuideCatalogAdapter('../generated/guides.json')
  const searchPort = options?.searchPort ?? new MiniSearchGuideEngineAdapter(catalogPort)
  return assembleGuideEngine(catalogPort, searchPort)
}
