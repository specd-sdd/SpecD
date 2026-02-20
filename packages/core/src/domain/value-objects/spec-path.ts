import { InvalidSpecPathError } from '../errors/invalid-spec-path-error.js'

/**
 * An immutable, validated path identifying a spec within the repository.
 *
 * Paths are slash-separated sequences of segments (e.g. `auth/oauth`).
 * Leading/trailing slashes and empty segments are normalized away.
 * Segments must not be `.`, `..`, or contain reserved filesystem characters.
 *
 * Use `SpecPath.parse(string)` or `SpecPath.fromSegments(string[])` to construct.
 */
export class SpecPath {
  private readonly _segments: readonly string[]

  /**
   * Internal constructor — use `SpecPath.parse` or `SpecPath.fromSegments` instead.
   *
   * @param segments - Pre-validated, non-empty array of path segments
   */
  private constructor(segments: readonly string[]) {
    this._segments = segments
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

  /** The individual path segments (e.g. `["auth", "oauth"]`). */
  get segments(): readonly string[] {
    return this._segments
  }

  /**
   * The parent path, or `null` if this is a top-level path.
   *
   * @example `SpecPath.parse("auth/oauth").parent` → `SpecPath("auth")`
   */
  get parent(): SpecPath | null {
    if (this._segments.length <= 1) return null
    return new SpecPath(this._segments.slice(0, -1))
  }

  /** The last segment of the path (e.g. `"oauth"` for `auth/oauth`). */
  get leaf(): string {
    const last = this._segments[this._segments.length - 1]
    // segments is guaranteed non-empty by constructor
    return last as string
  }

  /**
   * Returns a new `SpecPath` with `segment` appended as a child.
   *
   * @param segment - The child segment to append
   * @returns A new `SpecPath` one level deeper
   * @throws {InvalidSpecPathError} If the segment is invalid
   */
  child(segment: string): SpecPath {
    return SpecPath.parse(`${this.toString()}/${segment}`)
  }

  /**
   * Returns whether this path is a strict ancestor of `other`.
   *
   * @param other - The path to test against
   * @returns `true` if `other` starts with this path and has more segments
   */
  isAncestorOf(other: SpecPath): boolean {
    if (other._segments.length <= this._segments.length) return false
    return this._segments.every((s, i) => s === other._segments[i])
  }

  /**
   * Returns whether this path is equal to `other`.
   *
   * @param other - The path to compare against
   * @returns `true` if both paths resolve to the same string representation
   */
  equals(other: SpecPath): boolean {
    return this.toString() === other.toString()
  }

  /**
   * Returns the slash-separated string representation (e.g. `"auth/oauth"`).
   *
   * @returns The path as a string
   */
  toString(): string {
    return this._segments.join('/')
  }
}
