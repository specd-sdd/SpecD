import type { GuideOutline } from '../../domain/models/index.js'
import type { GuideCatalogPort } from '../ports/guide-catalog-port.js'
import { GetGuideQuery } from './get-guide-query.js'

/**
 * Input parameters for retrieving guide outline.
 */
export interface GetGuideOutlineInput {
  /** The guide topic identifier */
  readonly topic: string
}

/**
 * Use case to retrieve the structural outline and line bounds of a guide topic.
 */
export class GetGuideOutlineQuery {
  private readonly getGuideQuery: GetGuideQuery

  /**
   * Initializes the use case.
   *
   * @param catalogPort - Catalog port for guide resolution
   */
  constructor(catalogPort: GuideCatalogPort) {
    this.getGuideQuery = new GetGuideQuery(catalogPort)
  }

  /**
   * Executes outline extraction for a guide.
   *
   * @param input - Contains the topic identifier.
   * @returns GuideOutline with document statistics and section headings.
   */
  async execute(input: GetGuideOutlineInput): Promise<GuideOutline> {
    const guide = await this.getGuideQuery.execute({ topic: input.topic })
    return {
      topic: guide.topic,
      file: `${guide.topic}.md`,
      lines: guide.lineCount,
      bytes: guide.byteLength,
      sections: guide.outline,
    }
  }
}
