import { SpecPath } from '../value-objects/spec-path.js'

/**
 * A parsed spec document, identified by its path and holding its raw Markdown content.
 *
 * Provides section-level access to the content via `sections()` and `section()`.
 * Instances are immutable — `mergeSpecs` produces a new `Spec` rather than mutating.
 */
export class Spec {
  private readonly _path: SpecPath
  private readonly _content: string

  /**
   * Creates a new `Spec` with the given path and content.
   *
   * @param path - The path identifying this spec
   * @param content - The raw Markdown content
   */
  constructor(path: SpecPath, content: string) {
    this._path = path
    this._content = content
  }

  /** The path identifying this spec in the repository. */
  get path(): SpecPath {
    return this._path
  }

  /** The raw Markdown content of the spec. */
  get content(): string {
    return this._content
  }

  /**
   * Parses the content into a map of `## Section Name` → section body.
   *
   * Only level-2 headings (`##`) are treated as section delimiters.
   * The body of each section is trimmed of leading/trailing whitespace.
   *
   * @returns A `Map` from section name to trimmed section content
   */
  sections(): Map<string, string> {
    const result = new Map<string, string>()
    const lines = this._content.split('\n')

    let currentHeading: string | null = null
    let currentLines: string[] = []

    for (const line of lines) {
      const match = /^##\s+(.+)$/.exec(line)
      if (match?.[1] !== undefined) {
        if (currentHeading !== null) {
          result.set(currentHeading, currentLines.join('\n').trim())
        }
        currentHeading = match[1].trim()
        currentLines = []
      } else if (currentHeading !== null) {
        currentLines.push(line)
      }
    }

    if (currentHeading !== null) {
      result.set(currentHeading, currentLines.join('\n').trim())
    }

    return result
  }

  /**
   * Returns the body of a single section by name, or `null` if not present.
   *
   * @param name - The section heading text (without the `## ` prefix)
   * @returns The trimmed section body, or `null` if the section does not exist
   */
  section(name: string): string | null {
    return this.sections().get(name) ?? null
  }
}
