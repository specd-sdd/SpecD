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
   * The outline reports the document's real source path rather than a path derived
   * from the topic identifier, so a generated API topic surfaces the TypeScript
   * declaration it was extracted from instead of a synthesized Markdown path. It also
   * carries the package and import statement of a generated symbol, because those are
   * what a caller of the published API needs and the repository path is not.
   *
   * @param input - Contains the topic identifier.
   * @returns GuideOutline with document statistics and section headings.
   */
  async execute(input: GetGuideOutlineInput): Promise<GuideOutline> {
    const guide = await this.getGuideQuery.execute({ topic: input.topic })
    return {
      collection: guide.collection,
      topic: guide.topic,
      file: guide.sourcePath,
      ...(guide.packageName === undefined ? {} : { packageName: guide.packageName }),
      ...(guide.importStatement === undefined ? {} : { importStatement: guide.importStatement }),
      lines: guide.lineCount,
      bytes: guide.byteLength,
      sections: guide.outline.map((section) => ({
        index: section.index,
        heading: section.heading,
        level: section.level,
        startLine: section.startLine,
        endLine: section.endLine,
        lines: section.lines,
        startOffset: section.startOffset,
        endOffset: section.endOffset,
      })),
    }
  }
}
