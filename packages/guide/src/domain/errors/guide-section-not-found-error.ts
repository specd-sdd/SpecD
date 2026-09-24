import { SpecdGuideError } from './specd-guide-error.js'

/**
 * Thrown when a requested section heading or slug does not match any section in the guide.
 */
export class GuideSectionNotFoundError extends SpecdGuideError {
  private readonly _heading: string
  private readonly _availableHeadings: readonly string[]

  /**
   * Machine-readable error code.
   *
   * @returns 'UNKNOWN_GUIDE_SECTION'
   */
  override get code(): string {
    return 'UNKNOWN_GUIDE_SECTION'
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
   * The list of valid section headings in the guide.
   *
   * @returns Available headings
   */
  get availableHeadings(): readonly string[] {
    return this._availableHeadings
  }

  /**
   * Creates a new GuideSectionNotFoundError.
   *
   * @param heading - The heading string that was searched for.
   * @param availableHeadings - The list of valid section headings in the guide.
   */
  constructor(heading: string, availableHeadings: readonly string[] = []) {
    const list =
      availableHeadings.length > 0 ? ` Available sections: ${availableHeadings.join(', ')}` : ''
    super(`Section '${heading}' not found.${list}`)
    this._heading = heading
    this._availableHeadings = availableHeadings
  }
}
