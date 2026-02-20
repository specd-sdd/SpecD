import { InvalidSpecPathError } from '../errors/invalid-spec-path-error.js'
import { DomainPath } from './domain-path.js'

/**
 * An immutable, validated path identifying a spec within the repository.
 *
 * Paths are slash-separated sequences of segments (e.g. `"auth/oauth"`).
 * Leading/trailing slashes and empty segments are normalized away.
 * Segments must not be `.`, `..`, or contain reserved filesystem characters.
 *
 * Use `SpecPath.parse(string)` or `SpecPath.fromSegments(string[])` to construct.
 */
export class SpecPath extends DomainPath {
  /**
   * Internal constructor — use `SpecPath.parse` or `SpecPath.fromSegments` instead.
   *
   * @param segments - Pre-validated, non-empty array of path segments
   */
  private constructor(segments: readonly string[]) {
    super(segments)
  }

  /**
   * Creates a new `SpecPath` from pre-validated segments without re-running validation.
   *
   * Used by `_withSegments` to satisfy the `DomainPath` contract.
   *
   * @param segments - Pre-validated, non-empty array of path segments
   * @returns A new `SpecPath` wrapping the segments
   */
  protected _withSegments(segments: readonly string[]): this {
    return new SpecPath(segments) as this
  }

  /**
   * Parses and validates a slash-separated path string into a `SpecPath`.
   *
   * @param path - The path string to parse (e.g. `"auth/oauth"`)
   * @returns A validated `SpecPath` instance
   * @throws {InvalidSpecPathError} If the path is empty, contains `.` or `..` segments,
   *   or contains reserved characters (`\`, `:`, `*`, `?`, `"`, `<`, `>`, `|`)
   */
  static parse(path: string): SpecPath {
    const trimmed = path.trim()
    if (trimmed === '') throw new InvalidSpecPathError('path cannot be empty')

    const segments = trimmed.split('/').filter((s) => s.length > 0)
    if (segments.length === 0) throw new InvalidSpecPathError('path cannot be empty')

    for (const segment of segments) {
      if (segment === '.' || segment === '..') {
        throw new InvalidSpecPathError(`segment '${segment}' is not allowed`)
      }
      if (/[\\:*?"<>|]/.test(segment)) {
        throw new InvalidSpecPathError(`segment '${segment}' contains invalid characters`)
      }
    }

    return new SpecPath(segments)
  }

  /**
   * Creates a `SpecPath` directly from a pre-validated array of segments.
   *
   * @param segments - Non-empty array of path segments
   * @returns A `SpecPath` instance wrapping the given segments
   * @throws {InvalidSpecPathError} If the segments array is empty
   */
  static fromSegments(segments: readonly string[]): SpecPath {
    if (segments.length === 0) throw new InvalidSpecPathError('segments cannot be empty')
    return new SpecPath(segments)
  }

  /**
   * Returns a new `SpecPath` with `segment` appended, running full validation
   * on the resulting path.
   *
   * @param segment - The child segment to append
   * @returns A new `SpecPath` one level deeper
   * @throws {InvalidSpecPathError} If the segment is invalid
   */
  override child(segment: string): this {
    return SpecPath.parse(`${this.toString()}/${segment}`) as this
  }
}
