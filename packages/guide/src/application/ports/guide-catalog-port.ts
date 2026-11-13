import type { GuideSummary, GuideTopic } from '../../domain/models/index.js'
import type { GuideCollection } from '../../domain/models/guide-topic.js'

/**
 * Driven port for accessing the catalog of guide documents.
 *
 * A catalog is the unit a port serves: a port MUST serve exactly one catalog and
 * MUST NOT merge topics across catalogs. A catalog MAY contain more than one
 * collection, and every topic it exposes MUST carry its collection identity.
 */
export interface GuideCatalogPort {
  /**
   * Retrieves summary records for all available guides in the catalog.
   */
  listGuides(): Promise<readonly GuideSummary[]>

  /**
   * Retrieves summary records for all guides in the catalog, without filtering.
   */
  getAllGuides(): Promise<readonly GuideSummary[]>

  /**
   * Retrieves the identifiers of the collections the catalog contains.
   */
  getCollections(): Promise<readonly GuideCollection[]>

  /**
   * Retrieves all full guide topics.
   */
  getAllTopics(): Promise<readonly GuideTopic[]>

  /**
   * Retrieves a full guide topic by its collection-qualified identity, or null if not found.
   *
   * Because topic identifiers are only unique within a collection, this member
   * receives the `collection:topic` form and resolves within that collection.
   *
   * @param topic - Canonical collection-qualified topic identifier.
   */
  getGuide(topic: string): Promise<GuideTopic | null>
}
