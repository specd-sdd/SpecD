import type { GuideSummary } from '../../domain/models/index.js'
import type { GuideCatalogPort } from '../ports/guide-catalog-port.js'

/**
 * Use case to list all available guide summaries, sorted by sidebar position.
 */
export class ListGuidesQuery {
  /**
   * Initializes the use case.
   *
   * @param catalogPort - Catalog port for listing guides
   */
  constructor(private readonly catalogPort: GuideCatalogPort) {}

  /**
   * Executes the query to list all guides.
   *
   * @returns Array of guide summaries sorted ascending by order, then alphabetically by topic.
   */
  async execute(): Promise<readonly GuideSummary[]> {
    const rawGuides = await this.catalogPort.listGuides()
    return [...rawGuides].sort((a, b) => {
      if (a.order !== b.order) {
        return a.order - b.order
      }
      return a.topic.localeCompare(b.topic)
    })
  }
}
