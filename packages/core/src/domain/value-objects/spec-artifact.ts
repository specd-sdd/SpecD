/**
 * An artifact file within a spec directory or a change directory.
 *
 * Holds the filename, raw Markdown content, and an optional `originalHash`
 * that acts as a version token for optimistic concurrency control.
 *
 * **Lifecycle of `originalHash`:**
 * - When a repository loads an artifact from storage, it computes
 *   `sha256(content)` and passes it as `originalHash`.
 * - When a use case produces a derived artifact (e.g. via `mergeSpecs`),
 *   it propagates the `originalHash` from the source artifact so the
 *   token survives the transformation.
 * - When a repository saves a derived artifact, it re-hashes the current
 *   file on disk and compares against `originalHash`. If they differ, the
 *   file was modified between load and save — the write is rejected to
 *   prevent silently discarding concurrent changes (e.g. those made by
 *   an LLM agent writing to the same file).
 * - `originalHash` is `undefined` for artifacts that were never read from
 *   storage (e.g. scaffolded for the first time). In that case the
 *   repository performs no conflict check.
 */
export class SpecArtifact {
  private readonly _filename: string
  private readonly _content: string
  private readonly _originalHash: string | undefined

  /**
   * Creates a new `SpecArtifact`.
   *
   * @param filename - The artifact filename (e.g. `"spec.md"`, `"proposal.md"`)
   * @param content - The raw Markdown content of the file
   * @param originalHash - The `sha256:<hex>` hash of the content as it existed
   *   in storage when this artifact was loaded. Pass `undefined` for artifacts
   *   that have no prior storage representation (first write / scaffold).
   */
  constructor(filename: string, content: string, originalHash?: string) {
    this._filename = filename
    this._content = content
    this._originalHash = originalHash
  }

  /** The artifact filename (e.g. `"spec.md"`). */
  get filename(): string {
    return this._filename
  }

  /** The raw Markdown content of the artifact. */
  get content(): string {
    return this._content
  }

  /**
   * The `sha256:<hex>` hash of the content as it existed in storage when
   * this artifact was loaded, or `undefined` if the artifact has no prior
   * storage representation.
   *
   * Used by repository implementations to detect concurrent modifications:
   * before writing, the repository hashes the current file on disk and
   * compares against this value. A mismatch means another writer (e.g. an
   * LLM agent) modified the file after this artifact was loaded, and the
   * save should be rejected to avoid a lost update.
   */
  get originalHash(): string | undefined {
    return this._originalHash
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
