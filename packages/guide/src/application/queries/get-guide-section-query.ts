import { GuideSectionNotFoundError, GuideSectionAmbiguousError } from '../../domain/errors/index.js'
import type { GuideSection } from '../../domain/models/index.js'
import type { GuideCatalogPort } from '../ports/guide-catalog-port.js'
import { GetGuideQuery } from './get-guide-query.js'

/**
 * Input parameters for retrieving a specific guide section.
 */
export interface GetGuideSectionInput {
  /** The guide topic identifier */
  readonly topic: string
  /** Section identifier: 1-indexed section number, exact heading text, or slug */
  readonly section: string | number
}

/**
 * Normalizes a heading title into a URL-safe kebab-case slug.
 *
 * @param text - The raw heading string
 * @returns Kebab-cased slug string
 */
function toSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Use case to extract a specific section heading and body from a guide.
 */
export class GetGuideSectionQuery {
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
   * Extracts the section content matching the requested section index, heading, or slug.
   *
   * @param input - Contains the target topic and section query (index or heading text/slug).
   * @returns The matched GuideSection entity.
   * @throws {GuideSectionNotFoundError} If no section matches the index or heading.
   * @throws {GuideSectionAmbiguousError} If multiple sections match the queried heading name.
   */
  async execute(input: GetGuideSectionInput): Promise<GuideSection> {
    const guide = await this.getGuideQuery.execute({ topic: input.topic })
    const { section } = input

    // Check if section is a number or purely numeric string
    const isNumeric =
      typeof section === 'number' || (typeof section === 'string' && /^\d+$/.test(section.trim()))

    if (isNumeric) {
      const idx = typeof section === 'number' ? section : parseInt(section.trim(), 10)
      const found = guide.outline.find((s) => s.index === idx)
      if (!found) {
        throw new GuideSectionNotFoundError(
          String(section),
          guide.outline.map((s) => `${s.index}: ${s.heading}`),
        )
      }
      return found
    }

    // Match by heading or slug (case-insensitive)
    const rawHeading = String(section).trim().toLowerCase()
    const targetSlug = toSlug(String(section))

    const matches = guide.outline.filter((s) => {
      const sHeadingLower = s.heading.toLowerCase()
      const sSlug = toSlug(s.heading)
      return sHeadingLower === rawHeading || sSlug === targetSlug
    })

    if (matches.length === 1) {
      return matches[0]!
    }

    if (matches.length > 1) {
      throw new GuideSectionAmbiguousError(
        String(section),
        matches.map((s) => s.index),
        matches.map((s) => s.heading),
      )
    }

    throw new GuideSectionNotFoundError(
      String(section),
      guide.outline.map((s) => s.heading),
    )
  }
}
