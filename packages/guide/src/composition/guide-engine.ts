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
  GuideOutline,
  GuideSearchHit,
  GuideSection,
  GuideSummary,
  GuideTopic,
} from '../domain/models/index.js'
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
  listGuides(): Promise<readonly GuideSummary[]>
  getGuide(topic: string): Promise<GuideTopic>
  getGuideOutline(topic: string): Promise<GuideOutline>
  getGuideSection(topic: string, section: string | number): Promise<GuideSection>
  sliceGuideLines(content: string, startLine?: number, lineCount?: number): string
  formatWithLineNumbers(content: string, startLine?: number): string
  searchGuides(query: string, options?: GuideSearchOptions): Promise<readonly GuideSearchHit[]>
}

/**
 * Factory function creating a fully assembled GuideEngine instance.
 *
 * @param options - Optional port overrides for custom testing or catalog sources.
 * @returns Configured GuideEngine facade.
 */
export function createGuideEngine(options?: GuideEngineOptions): GuideEngine {
  const catalogPort = options?.catalogPort ?? new PrebundledGuideCatalogAdapter()
  const searchPort = options?.searchPort ?? new MiniSearchGuideEngineAdapter(catalogPort)

  const listGuidesQuery = new ListGuidesQuery(catalogPort)
  const getGuideQuery = new GetGuideQuery(catalogPort)
  const getGuideOutlineQuery = new GetGuideOutlineQuery(catalogPort)
  const getGuideSectionQuery = new GetGuideSectionQuery(catalogPort)
  const searchGuidesQuery = new SearchGuidesQuery(searchPort)

  return {
    listGuides: () => listGuidesQuery.execute(),
    getGuide: (topic: string) => getGuideQuery.execute({ topic }),
    getGuideOutline: (topic: string) => getGuideOutlineQuery.execute({ topic }),
    getGuideSection: (topic: string, section: string | number) =>
      getGuideSectionQuery.execute({ topic, section }),
    sliceGuideLines: (content: string, startLine?: number, lineCount?: number) =>
      sliceGuideLines(content, startLine, lineCount),
    formatWithLineNumbers: (content: string, startLine?: number) =>
      formatWithLineNumbers(content, startLine),
    searchGuides: (query: string, searchOptions?: GuideSearchOptions) =>
      searchGuidesQuery.execute({ query, ...searchOptions }),
  }
}
