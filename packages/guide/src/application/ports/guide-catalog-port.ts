import type { GuideSummary, GuideTopic } from '../../domain/models/index.js'

/**
 * Driven port for accessing the catalog of guide documents.
 */
export interface GuideCatalogPort {
  /**
   * Retrieves summary records for all available guides in the catalog.
   */
  listGuides(): Promise<readonly GuideSummary[]>

  /**
   * Retrieves a full guide topic by identifier, or null if not found.
   *
   * @param topic - Canonical topic identifier.
   */
  getGuide(topic: string): Promise<GuideTopic | null>

  /**
   * Retrieves all full guide topics.
   */
  getAllGuides(): Promise<readonly GuideTopic[]>
}
