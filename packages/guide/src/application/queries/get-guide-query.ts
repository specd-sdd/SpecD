import { GuideTopicNotFoundError } from '../../domain/errors/index.js'
import type { GuideTopic } from '../../domain/models/index.js'
import type { GuideCatalogPort } from '../ports/guide-catalog-port.js'

/**
 * Input parameters for retrieving a guide topic.
 */
export interface GetGuideInput {
  /** The target topic identifier */
  readonly topic: string
}

/**
 * Use case to retrieve a single guide topic by identifier.
 */
export class GetGuideQuery {
  /**
   * Initializes the use case.
   *
   * @param catalogPort - Catalog port for guide resolution
   */
  constructor(private readonly catalogPort: GuideCatalogPort) {}

  /**
   * Executes the query to fetch a guide.
   *
   * @param input - Contains the target topic identifier.
   * @returns The resolved GuideTopic entity.
   * @throws {GuideTopicNotFoundError} If the topic does not exist.
   */
  async execute(input: GetGuideInput): Promise<GuideTopic> {
    const rawTopic = input.topic ?? ''
    const trimmed = rawTopic.trim()
    const normalized = trimmed.endsWith('.md')
      ? trimmed.slice(0, -3).toLowerCase()
      : trimmed.toLowerCase()

    if (normalized.length === 0) {
      const all = await this.catalogPort.listGuides()
      throw new GuideTopicNotFoundError(
        rawTopic,
        all.map((g) => g.topic),
      )
    }

    const guide = await this.catalogPort.getGuide(normalized)
    if (guide !== null) {
      return guide
    }

    const all = await this.catalogPort.listGuides()
    throw new GuideTopicNotFoundError(
      rawTopic,
      all.map((g) => g.topic),
    )
  }
}
