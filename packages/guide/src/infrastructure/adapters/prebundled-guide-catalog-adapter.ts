import type { GuideCatalogPort } from '../../application/ports/guide-catalog-port.js'
import type { GuideSummary, GuideTopic } from '../../domain/models/index.js'
import { GUIDES_CATALOG, GUIDES_INDEX } from '../generated/guides.js'

/**
 * In-memory catalog adapter backed by pre-bundled static guide records.
 */
export class PrebundledGuideCatalogAdapter implements GuideCatalogPort {
  /**
   * Initializes the adapter with optional catalog and index overrides.
   *
   * @param catalog - Static array of guide topics
   * @param index - Index lookup mapping topic names to positions
   */
  constructor(
    private readonly catalog: readonly GuideTopic[] = GUIDES_CATALOG,
    private readonly index: Readonly<Record<string, number>> = GUIDES_INDEX,
  ) {}

  /**
   * Returns summary descriptors for all guides in the catalog.
   *
   * @returns Array of guide summary descriptors
   */
  listGuides(): Promise<readonly GuideSummary[]> {
    return Promise.resolve(
      this.catalog.map((g) => ({
        topic: g.topic,
        title: g.title,
        description: g.description,
        order: g.order,
        lineCount: g.lineCount,
        byteLength: g.byteLength,
      })),
    )
  }

  /**
   * Looks up a single guide by topic identifier (case-insensitive, optional .md).
   *
   * @param topic - The topic identifier to retrieve
   * @returns The matching guide topic or null
   */
  getGuide(topic: string): Promise<GuideTopic | null> {
    const normalized = topic.trim().toLowerCase().replace(/\.md$/, '')
    const idx = this.index[normalized]
    if (idx !== undefined && idx in this.catalog) {
      return Promise.resolve(this.catalog[idx]!)
    }
    return Promise.resolve(null)
  }

  /**
   * Returns all full guide topic entities.
   *
   * @returns Array of full guide topics
   */
  getAllGuides(): Promise<readonly GuideTopic[]> {
    return Promise.resolve(this.catalog)
  }
}
