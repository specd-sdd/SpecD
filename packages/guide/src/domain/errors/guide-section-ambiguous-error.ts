import { SpecdGuideError } from './specd-guide-error.js'

/**
 * Thrown when a section query by heading name or slug matches multiple sections,
 * requiring explicit disambiguation via 1-indexed section number.
 */
export class GuideSectionAmbiguousError extends SpecdGuideError {
  private readonly _heading: string
  private readonly _matchingIndices: readonly number[]
  private readonly _matchingHeadings: readonly string[]

  /**
   * Machine-readable error code.
   *
   * @returns 'AMBIGUOUS_GUIDE_SECTION'
   */
  override get code(): string {
    return 'AMBIGUOUS_GUIDE_SECTION'
  }

  /**
   * The heading string that was searched for.
   *
   * @returns The requested heading
   */
  get heading(): string {
    return this._heading
  }

  /**
   * The indices of all matching sections.
   *
   * @returns Matching indices
   */
  get matchingIndices(): readonly number[] {
    return this._matchingIndices
  }

  /**
   * The heading titles of all matching sections.
   *
   * @returns Matching headings
   */
  get matchingHeadings(): readonly string[] {
    return this._matchingHeadings
  }

  /**
   * Creates a new GuideSectionAmbiguousError.
   *
   * @param heading - The heading that was matched ambiguously
   * @param matchingIndices - The 1-indexed section indices
   * @param matchingHeadings - The section heading labels
   */
  constructor(
    heading: string,
    matchingIndices: readonly number[],
    matchingHeadings: readonly string[],
  ) {
    super(
      `Multiple sections match '${heading}'. Matching sections: ${matchingHeadings.join(
        ', ',
      )}. Use --section <number> to disambiguate.`,
    )
    this._heading = heading
    this._matchingIndices = matchingIndices
    this._matchingHeadings = matchingHeadings
  }
}
